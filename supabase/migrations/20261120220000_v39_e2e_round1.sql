-- v39 (e2e round 1): customer cancel of a placed order; stale assignments are
-- excluded from stacking, route and ETA, and flagged — never auto-cancelled.
-- THIS FILE IS NOT APPLIED LIVE. Apply only after Zsolt approves.

-- ===== 1) Customer can cancel their own order only while it is still 'placed' =====
-- Race with restaurant accept: USING sees the current row. If the restaurant
-- accepted first, status is no longer 'placed' and this policy matches 0 rows.
drop policy if exists "customer cancels own placed order" on public.orders;
create policy "customer cancels own placed order" on public.orders
  for update to authenticated
  using (customer_id = (select auth.uid()) and status = 'placed')
  with check (
    customer_id = (select auth.uid())
    and status = 'cancelled'
    and cancel_reason = 'customer_cancelled'
  );

-- Allow the customer (on a still-placed order) in the status machine, and stamp
-- cancel_reason = customer_cancelled when they do it.
create or replace function public.enforce_order_transition() returns trigger language plpgsql set search_path to 'public' as $function$
declare ok boolean; is_user boolean := current_user = 'authenticated'; is_admin boolean; pickup boolean := new.fulfilment = 'pickup';
  is_customer boolean := is_user and auth.uid() is not null and auth.uid() = old.customer_id;
  is_restaurant boolean := is_user and my_restaurant() is not distinct from old.restaurant_id;
begin
  if new.status = old.status then return new; end if;
  is_admin := is_user and coalesce(my_role()::text, '') = 'admin';
  ok := case old.status
    when 'awaiting_payment' then new.status in ('placed', 'payment_failed', 'cancelled')
    when 'payment_failed'   then new.status in ('awaiting_payment', 'placed', 'cancelled')
    when 'placed'           then new.status in ('accepted', 'cancelled')
    when 'accepted'         then (not pickup and new.status = 'assigned') or (pickup and new.status = 'ready') or new.status = 'cancelled'
    when 'assigned'         then new.status in ('ready', 'cancelled')
    when 'ready'            then (not pickup and new.status = 'picked_up') or (pickup and new.status = 'delivered') or new.status = 'cancelled'
    when 'picked_up'        then new.status = 'delivered' or (new.status = 'cancelled' and not is_user)
                                 or (new.status = 'cancelled' and is_admin)
    else false end;
  if not ok then raise exception 'invalid status change: % -> %', old.status, new.status; end if;

  if is_user and not is_admin then
    if new.status in ('accepted', 'ready') and not is_restaurant then
      raise exception 'only the restaurant can mark the order %', new.status;
    elsif pickup and new.status = 'delivered' and not is_restaurant then
      raise exception 'only the restaurant can mark a pickup order collected';
    elsif not pickup and new.status in ('picked_up', 'delivered') and old.rider_id is distinct from auth.uid() then
      raise exception 'only the assigned rider can mark the order %', new.status;
    elsif new.status = 'cancelled' and not (
      (old.status = 'placed' and is_restaurant)
      or (old.status = 'placed' and is_customer)
    ) then
      raise exception 'only the customer or the restaurant (before accepting) or an admin can cancel an order';
    elsif new.status in ('placed', 'payment_failed', 'awaiting_payment', 'assigned') then
      raise exception 'status % is set by the system', new.status;
    end if;
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancel_reason := coalesce(nullif(new.cancel_reason, ''),
      case
        when is_admin then 'admin_cancelled'
        when is_customer then 'customer_cancelled'
        when is_user then 'restaurant_rejected'
        else 'system'
      end);
  end if;
  return new;
end $function$;

-- ===== 2) Stale assignments: 3 hours past expected pickup, no auto-cancel =====
-- Expected pickup = ready_at (when the kitchen marked ready), else assigned_at.
-- Only assigned/ready (not yet picked up) can be stale.
create or replace function public.fp_assignment_stale(
  p_status order_status,
  p_assigned_at timestamptz,
  p_ready_at timestamptz,
  p_now timestamptz default now()
) returns boolean
language sql immutable parallel safe as $$
  select p_status in ('assigned', 'ready')
     and coalesce(p_ready_at, p_assigned_at) is not null
     and coalesce(p_ready_at, p_assigned_at) < p_now - interval '3 hours';
$$;
comment on function public.fp_assignment_stale(order_status, timestamptz, timestamptz, timestamptz) is
  'True when an assigned/ready order has not been picked up for more than 3 hours past ready_at (else assigned_at). Used to exclude stale jobs from stacking, route and ETA. Does not cancel or refund.';
revoke execute on function public.fp_assignment_stale(order_status, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.fp_assignment_stale(order_status, timestamptz, timestamptz, timestamptz) to authenticated;

create or replace function public.fp_list_stale_assignments()
returns table (
  id bigint,
  rider_id uuid,
  status order_status,
  is_test boolean,
  assigned_at timestamptz,
  ready_at timestamptz,
  expected_at timestamptz,
  hours_overdue numeric
)
language sql stable security definer set search_path = public as $$
  select o.id, o.rider_id, o.status, o.is_test, o.assigned_at, o.ready_at,
         coalesce(o.ready_at, o.assigned_at) as expected_at,
         round((extract(epoch from (now() - coalesce(o.ready_at, o.assigned_at))) / 3600)::numeric, 1) as hours_overdue
  from orders o
  where fp_assignment_stale(o.status, o.assigned_at, o.ready_at)
    and (select my_role()) = 'admin'
  order by coalesce(o.ready_at, o.assigned_at);
$$;
revoke execute on function public.fp_list_stale_assignments() from public, anon;
grant execute on function public.fp_list_stale_assignments() to authenticated;

-- Stacking / bid eligibility ignores stale assignments when counting "busy" work.
create or replace function public.fp_stack_reason(p_rider uuid, p_order bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare s settings; n int; o record; a record; d float8; b1 float8; b2 float8; diff float8;
begin
  select * into s from settings limit 1;
  select count(*) into n from orders
    where rider_id = p_rider and status in ('assigned', 'ready', 'picked_up')
      and not fp_assignment_stale(status, assigned_at, ready_at);
  if n = 0 then return null; end if;
  if n >= s.max_active_orders then return format('You already have %s active order(s) (limit %s)', n, s.max_active_orders); end if;
  select x.lat, x.lng, r.lat rlat, r.lng rlng into o from orders x join restaurants r on r.id = x.restaurant_id where x.id = p_order;
  if o.rlat is null or o.lat is null then return 'Missing location for this order'; end if;
  for a in select x.id, x.status, x.lat, x.lng, r.lat rlat, r.lng rlng from orders x join restaurants r on r.id = x.restaurant_id
           where x.rider_id = p_rider and x.status in ('assigned', 'ready', 'picked_up')
             and not fp_assignment_stale(x.status, x.assigned_at, x.ready_at) loop
    if a.status = 'picked_up' then return 'Finish your current delivery first (already picked up)'; end if;
    if a.rlat is null or a.lat is null then return 'Missing location on your current order'; end if;
    d := fp_distance_km(a.rlat, a.rlng, o.rlat, o.rlng);
    if d > s.stack_pickup_km then return format('Pickup is %s km from your current pickup (max %s km)', round(d::numeric, 1), s.stack_pickup_km); end if;
    b1 := fp_bearing(a.rlat, a.rlng, a.lat, a.lng); b2 := fp_bearing(o.rlat, o.rlng, o.lat, o.lng);
    diff := abs(b1 - b2); if diff > 180 then diff := 360 - diff; end if;
    if diff > s.stack_bearing_deg then return format('Drop-off goes another way (%s° apart, max %s°)', round(diff::numeric), s.stack_bearing_deg); end if;
  end loop;
  return null;
end $$;
revoke execute on function public.fp_stack_reason(uuid, bigint) from public, anon, authenticated;

-- v10 resolve, plus stale jobs do not count as busy (so they do not stack or block).
create or replace function public.fp_resolve_bids(p_order bigint default null) returns integer
language plpgsql security definer set search_path = public as $$
declare o record; w bids; n int := 0; busy int;
begin
  for o in select x.id from orders x where x.status = 'accepted' and x.rider_id is null
             and (x.bid_window_closes_at <= now()
                  or (x.bid_window_closes_at is null and exists (select 1 from bids b where b.order_id = x.id and not b.accepted)))
             and (p_order is null or x.id = p_order) order by x.bid_window_closes_at nulls first, x.id for update skip locked loop
    w := null;
    for w in select b.* from bids b where b.order_id = o.id and not b.accepted
               and b.rider_id in (select id from profiles where status = 'active')
               order by b.eta_minutes asc, b.created_at asc, b.id asc loop
      exit when fp_stack_reason(w.rider_id, o.id) is null;
      w := null;
    end loop;
    if w.id is not null then
      select count(*) into busy from orders
        where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up')
          and not fp_assignment_stale(status, assigned_at, ready_at);
      update bids set accepted = true where id = w.id;
      update orders set rider_id = w.rider_id, status = 'assigned', assigned_at = now(), stacked = busy > 0 where id = o.id;
      if busy > 0 then
        update orders set stacked = true
          where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up')
            and not fp_assignment_stale(status, assigned_at, ready_at);
      end if;
      n := n + 1;
    elsif exists (select 1 from bids b join profiles p on p.id = b.rider_id and p.status = 'active'
                  where b.order_id = o.id and not b.accepted and b.created_at > now() - interval '5 minutes') then
      update orders set bid_window_closes_at = now() + interval '15 seconds' where id = o.id;
    elsif exists (select 1 from bids b where b.order_id = o.id and not b.accepted) then
      delete from bids where order_id = o.id and not accepted;
      update orders set bid_window_closes_at = null where id = o.id;
    else
      update orders set bid_window_closes_at = null where id = o.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.fp_resolve_bids(bigint) from public, anon, authenticated;

-- Route stops skip stale assigned/ready jobs so they no longer inflate the rider's route or the customer's stops-before count.
create or replace function public.fp_rider_stops(p_rider uuid) returns table(seq int, kind text, order_id bigint, label text, lat float8, lng float8)
language plpgsql stable security definer set search_path = public as $$
declare cur_lat float8; cur_lng float8; r record; i int := 0; left_ids bigint[];
begin
  for r in select x.restaurant_id, min(rs.name) name, min(rs.lat) lat, min(rs.lng) lng, array_agg(x.id order by x.id) ids, min(x.assigned_at) first_at
           from orders x join restaurants rs on rs.id = x.restaurant_id
           where x.rider_id = p_rider and x.status in ('assigned', 'ready')
             and not fp_assignment_stale(x.status, x.assigned_at, x.ready_at)
           group by x.restaurant_id order by min(x.assigned_at) loop
    foreach order_id in array r.ids loop
      i := i + 1; seq := i; kind := 'pickup'; label := r.name; lat := r.lat; lng := r.lng; return next;
    end loop;
    cur_lat := r.lat; cur_lng := r.lng;
  end loop;
  left_ids := array(select x.id from orders x where x.rider_id = p_rider and x.status in ('assigned', 'ready', 'picked_up')
                      and not fp_assignment_stale(x.status, x.assigned_at, x.ready_at));
  if cur_lat is null then
    select l.lat, l.lng into cur_lat, cur_lng from rider_locations l where l.rider_id = p_rider order by l.created_at desc limit 1;
  end if;
  while cardinality(left_ids) > 0 loop
    select x.id, x.address, x.lat, x.lng into r from orders x where x.id = any(left_ids)
      order by case when cur_lat is null or x.lat is null then 0 else fp_distance_km(cur_lat, cur_lng, x.lat, x.lng) end, x.assigned_at limit 1;
    i := i + 1; seq := i; kind := 'dropoff'; order_id := r.id; label := r.address; lat := r.lat; lng := r.lng; return next;
    cur_lat := coalesce(r.lat, cur_lat); cur_lng := coalesce(r.lng, cur_lng);
    left_ids := array_remove(left_ids, r.id);
  end loop;
end $$;
revoke execute on function public.fp_rider_stops(uuid) from public, anon, authenticated;
