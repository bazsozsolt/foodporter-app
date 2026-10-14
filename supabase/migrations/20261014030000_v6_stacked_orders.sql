-- v6: stacked orders (a rider may carry up to N orders when pickups are close and drop-offs go the same way)
alter table settings
  add column if not exists max_active_orders int not null default 2 check (max_active_orders between 1 and 3),
  add column if not exists stack_pickup_km numeric not null default 1.0 check (stack_pickup_km between 0.1 and 3),
  add column if not exists stack_bearing_deg int not null default 60 check (stack_bearing_deg between 10 and 180);
alter table orders add column if not exists stacked boolean not null default false;

create or replace function fp_bearing(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = public as $$
  select mod((degrees(atan2(sin(radians(lng2 - lng1)) * cos(radians(lat2)),
    cos(radians(lat1)) * sin(radians(lat2)) - sin(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1)))) + 360)::numeric, 360)::float8;
$$;

-- null = rider may take this order; otherwise the reason why not.
create or replace function fp_stack_reason(p_rider uuid, p_order bigint) returns text
language plpgsql stable security definer set search_path = public as $$
declare s settings; n int; o record; a record; d float8; b1 float8; b2 float8; diff float8;
begin
  select * into s from settings limit 1;
  select count(*) into n from orders where rider_id = p_rider and status in ('assigned', 'ready', 'picked_up');
  if n = 0 then return null; end if;
  if n >= s.max_active_orders then return format('You already have %s active order(s) (limit %s)', n, s.max_active_orders); end if;
  select x.lat, x.lng, r.lat rlat, r.lng rlng into o from orders x join restaurants r on r.id = x.restaurant_id where x.id = p_order;
  if o.rlat is null or o.lat is null then return 'Missing location for this order'; end if;
  for a in select x.id, x.status, x.lat, x.lng, r.lat rlat, r.lng rlng from orders x join restaurants r on r.id = x.restaurant_id
           where x.rider_id = p_rider and x.status in ('assigned', 'ready', 'picked_up') loop
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

-- what the rider app asks: "may I bid on this order?"
create or replace function can_bid(p_order bigint) returns text language sql stable security definer set search_path = public as $$
  select fp_stack_reason(auth.uid(), p_order) where my_role() = 'rider';
$$;
revoke execute on function public.can_bid(bigint) from public, anon;
grant execute on function public.can_bid(bigint) to authenticated;

-- used by the bid insert policy (security definer: reads the rider's other orders)
create or replace function fp_may_bid(p_order bigint) returns boolean language sql stable security definer set search_path = public as $$
  select fp_stack_reason(auth.uid(), p_order) is null;
$$;
revoke execute on function public.fp_may_bid(bigint) from public, anon;
grant execute on function public.fp_may_bid(bigint) to authenticated;

alter policy "riders bid" on bids with check (
  rider_id = (select auth.uid()) and (select my_role()) = 'rider' and (select my_status()) = 'active' and accepted = false
  and exists (select 1 from orders o where o.id = bids.order_id and o.status = 'accepted' and o.rider_id is null
              and (o.bid_window_closes_at is null or o.bid_window_closes_at > now()))
  and fp_may_bid(order_id));

-- winner selection re-checks eligibility (a rider may have won another order meanwhile)
create or replace function fp_resolve_bids(p_order bigint default null) returns integer
language plpgsql security definer set search_path = public as $$
declare o record; w bids; n int := 0; busy int;
begin
  for o in select id from orders where status = 'accepted' and rider_id is null and bid_window_closes_at <= now()
           and (p_order is null or id = p_order) order by bid_window_closes_at, id for update skip locked loop
    w := null;
    for w in select b.* from bids b where b.order_id = o.id and not b.accepted
               and b.rider_id in (select id from profiles where status = 'active')
               order by b.eta_minutes asc, b.created_at asc, b.id asc loop
      exit when fp_stack_reason(w.rider_id, o.id) is null;
      w := null;
    end loop;
    if w.id is not null then
      select count(*) into busy from orders where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up');
      update bids set accepted = true where id = w.id;
      update orders set rider_id = w.rider_id, status = 'assigned', assigned_at = now(), stacked = busy > 0 where id = o.id;
      if busy > 0 then update orders set stacked = true where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up'); end if;
      n := n + 1;
    else
      update orders set bid_window_closes_at = null where id = o.id; -- nobody eligible: reopen
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.fp_resolve_bids(bigint) from public, anon, authenticated;

-- Ordered stop list for a rider: all pickups not yet done (grouped by restaurant), then drop-offs nearest-first.
create or replace function fp_rider_stops(p_rider uuid) returns table(seq int, kind text, order_id bigint, label text, lat float8, lng float8)
language plpgsql stable security definer set search_path = public as $$
declare cur_lat float8; cur_lng float8; r record; i int := 0; left_ids bigint[];
begin
  for r in select x.restaurant_id, min(rs.name) name, min(rs.lat) lat, min(rs.lng) lng, array_agg(x.id order by x.id) ids, min(x.assigned_at) first_at
           from orders x join restaurants rs on rs.id = x.restaurant_id
           where x.rider_id = p_rider and x.status in ('assigned', 'ready') group by x.restaurant_id order by min(x.assigned_at) loop
    foreach order_id in array r.ids loop
      i := i + 1; seq := i; kind := 'pickup'; label := r.name; lat := r.lat; lng := r.lng; return next;
    end loop;
    cur_lat := r.lat; cur_lng := r.lng;
  end loop;
  left_ids := array(select x.id from orders x where x.rider_id = p_rider and x.status in ('assigned', 'ready', 'picked_up'));
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

create or replace function my_stops() returns table(seq int, kind text, order_id bigint, label text, lat float8, lng float8)
language sql stable security definer set search_path = public as $$ select * from fp_rider_stops(auth.uid()); $$;
revoke execute on function public.my_stops() from public, anon;
grant execute on function public.my_stops() to authenticated;

-- Customer: how many stops the rider makes before this customer's drop-off (no other customers' details).
create or replace function order_stops_before(p_order bigint) returns int
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from fp_rider_stops(o.rider_id) s
          where s.seq < (select s2.seq from fp_rider_stops(o.rider_id) s2 where s2.kind = 'dropoff' and s2.order_id = o.id)
            and s.order_id <> o.id)
  from orders o where o.id = p_order and o.rider_id is not null and o.status in ('assigned', 'ready', 'picked_up')
    and (o.customer_id = auth.uid() or my_role() = 'admin');
$$;
revoke execute on function public.order_stops_before(bigint) from public, anon;
grant execute on function public.order_stops_before(bigint) to authenticated;

-- Locations: the customer/restaurant of an active order see their rider's points (whatever order the point was tagged with),
-- but only points since that order was assigned.
alter policy "locations visible to order parties" on rider_locations using (
  rider_id = (select auth.uid()) or (select my_role()) = 'admin'
  or exists (select 1 from orders o where o.rider_id = rider_locations.rider_id
             and o.status in ('assigned', 'ready', 'picked_up') and rider_locations.created_at >= o.assigned_at
             and (o.customer_id = (select auth.uid()) or o.restaurant_id = (select my_restaurant()))));
create index if not exists orders_rider_active_idx on orders(rider_id) where status in ('assigned', 'ready', 'picked_up');

-- Reports: stacked flag + comparison
create or replace view order_facts with (security_invoker = true) as
SELECT o.id, o.created_at, o.status, o.restaurant_id, r.name AS restaurant_name, o.rider_id, o.customer_id,
    o.subtotal_cents, o.delivery_fee_cents, COALESCE(r.commission_pct, 12::numeric) AS commission_pct,
    round(o.subtotal_cents::numeric * COALESCE(r.commission_pct, 12::numeric) / 100.0)::integer AS commission_cents,
    o.prep_minutes, o.accepted_at, o.ready_at, o.delivered_at, o.paid_at, o.restaurant_payout_id,
    COALESCE(o.assigned_at, b.created_at) AS bid_at, b.eta_minutes, b.rider_name,
    EXTRACT(epoch FROM COALESCE(o.assigned_at, b.created_at) - o.accepted_at)::integer AS bid_seconds,
    (COALESCE(o.assigned_at, b.created_at) - o.accepted_at) <= '00:03:00'::interval AS fast_bid,
    o.delivered_at <= (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes)) AS on_time,
    CASE WHEN o.delivered_at IS NOT NULL AND b.created_at IS NOT NULL
      THEN EXTRACT(epoch FROM o.delivered_at - (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes)))::integer / 60 ELSE NULL::integer END AS minutes_late,
    CASE WHEN o.status = ANY (ARRAY['ready'::order_status, 'picked_up'::order_status, 'delivered'::order_status]) AND o.accepted_at IS NOT NULL AND o.ready_at IS NOT NULL
      THEN round(EXTRACT(epoch FROM o.ready_at - o.accepted_at) / 60.0, 1) ELSE NULL::numeric END AS actual_prep_minutes,
    (SELECT count(*) FROM audit_events e WHERE e.order_id = o.id AND e.type = 'prep_extended')::integer AS prep_extensions,
    o.status <> ALL (ARRAY['awaiting_payment'::order_status, 'payment_failed'::order_status, 'cancelled'::order_status]) AS is_paid,
    (o.is_test OR o.address ~~ 'FP TEST%') AS is_test,
    EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') >= 22
      OR EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') < 6 AS late_night,
    rt.food_stars, rt.rider_stars, o.cancel_reason, o.refund_status, o.refund_cents, o.distance_km, o.stacked
FROM orders o
LEFT JOIN restaurants r ON r.id = o.restaurant_id
LEFT JOIN bids b ON b.order_id = o.id AND b.accepted
LEFT JOIN ratings rt ON rt.order_id = o.id;

create or replace function report_delivery(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'orders', count(*) filter (where is_paid),
    'delivered', count(*) filter (where status = 'delivered'),
    'with_bid', count(bid_at),
    'avg_bid_seconds', round(avg(bid_seconds)),
    'pct_bid_3min', round(100.0 * count(*) filter (where fast_bid) / nullif(count(bid_at), 0), 1),
    'pct_on_time', round(100.0 * count(*) filter (where on_time) / nullif(count(*) filter (where status = 'delivered'), 0), 1),
    'pct_key_metric', round(100.0 * count(*) filter (where fast_bid and on_time) / nullif(count(*) filter (where is_paid), 0), 1),
    'avg_prep_planned', round(avg(prep_minutes) filter (where actual_prep_minutes is not null), 1),
    'avg_prep_actual', round(avg(actual_prep_minutes), 1),
    'stacked', jsonb_build_object(
      'stacked_delivered', count(*) filter (where status = 'delivered' and stacked),
      'single_delivered', count(*) filter (where status = 'delivered' and not stacked),
      'stacked_pct_on_time', round(100.0 * count(*) filter (where on_time and stacked) / nullif(count(*) filter (where status = 'delivered' and stacked), 0), 1),
      'single_pct_on_time', round(100.0 * count(*) filter (where on_time and not stacked) / nullif(count(*) filter (where status = 'delivered' and not stacked), 0), 1),
      'stacked_avg_minutes_late', round(avg(greatest(minutes_late, 0)) filter (where status = 'delivered' and stacked), 1),
      'single_avg_minutes_late', round(avg(greatest(minutes_late, 0)) filter (where status = 'delivered' and not stacked), 1)),
    'late', coalesce(jsonb_agg(jsonb_build_object('id', id, 'restaurant', restaurant_name, 'rider', rider_name, 'eta', eta_minutes,
              'minutes_late', minutes_late, 'delivered_at', delivered_at, 'stacked', stacked) order by id) filter (where status = 'delivered' and not on_time), '[]'::jsonb)
  ) into res
  from order_facts where created_at >= p_from and created_at < p_to;
  return res;
end $$;

CREATE OR REPLACE FUNCTION public.report_quality(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'orders', (select count(*) from orders where created_at >= p_from and created_at < p_to),
    'cancelled', (select count(*) from orders where status = 'cancelled' and created_at >= p_from and created_at < p_to),
    'cancel_reasons', (select coalesce(jsonb_object_agg(cancel_reason, n), '{}'::jsonb) from (select cancel_reason, count(*) n from orders where status = 'cancelled' and created_at >= p_from and created_at < p_to group by cancel_reason) t),
    'refunds', (select count(*) from orders where refund_id is not null and created_at >= p_from and created_at < p_to),
    'refund_cents', (select coalesce(sum(refund_cents), 0) from orders where refund_id is not null and created_at >= p_from and created_at < p_to),
    'refunds_failed', (select count(*) from orders where refund_status = 'failed' and created_at >= p_from and created_at < p_to),
    'no_bid_alerts', (select count(*) from ops_alerts where kind = 'no_bid' and created_at >= p_from and created_at < p_to),
    'payment_failed', (select count(*) from orders where status = 'payment_failed' and created_at >= p_from and created_at < p_to),
    'awaiting_payment', (select count(*) from orders where status = 'awaiting_payment' and created_at >= p_from and created_at < p_to),
    'prep_extensions', (select count(*) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'orders_extended', (select count(distinct order_id) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'extension_minutes', (select coalesce(sum(to_value::int - from_value::int), 0) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'incidents_by_type', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) n from incidents where occurred_at >= p_from and occurred_at < p_to group by type) t),
    'ratings', (select count(*) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to),
    'avg_food_rating', (select round(avg(rt.food_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to),
    'avg_rider_rating', (select round(avg(rt.rider_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to),
    'stacked', (select jsonb_build_object(
        'stacked_ratings', count(*) filter (where o.stacked), 'single_ratings', count(*) filter (where not o.stacked),
        'stacked_avg_food', round(avg(rt.food_stars) filter (where o.stacked), 2), 'single_avg_food', round(avg(rt.food_stars) filter (where not o.stacked), 2),
        'stacked_avg_rider', round(avg(rt.rider_stars) filter (where o.stacked), 2), 'single_avg_rider', round(avg(rt.rider_stars) filter (where not o.stacked), 2))
      from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to),
    'by_restaurant', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
        select jsonb_build_object('restaurant', r.name,
          'orders', (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and o.status not in ('awaiting_payment','payment_failed')),
          'cancelled', (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and o.status = 'cancelled'),
          'extensions', (select count(*) from audit_events e join orders o on o.id = e.order_id where o.restaurant_id = r.id and e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to),
          'incidents', (select count(*) from incidents i where i.restaurant_id = r.id and i.occurred_at >= p_from and i.occurred_at < p_to),
          'ratings', (select count(*) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to),
          'rating', (select round(avg(rt.food_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to)) x
        from restaurants r) s)
  ) into res;
  return res;
end $function$;
revoke execute on function public.report_delivery(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_delivery(timestamptz, timestamptz) to authenticated;
