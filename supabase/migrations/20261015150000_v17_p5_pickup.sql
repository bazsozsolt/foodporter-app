-- v17 P5: pickup (afhalen). No rider, no delivery fee; restaurant marks ready (customer notified) and then collected (= delivered).
alter table orders add column if not exists fulfilment text not null default 'delivery' check (fulfilment in ('delivery', 'pickup'));
grant select (fulfilment) on orders to authenticated;
grant insert (fulfilment) on orders to authenticated;

-- on insert: pickup orders have no delivery fee and never enter rider bidding / no-bid alerts (fp_run_timeouts skips rows with these stamps set)
create or replace function public.fp_pickup_insert() returns trigger language plpgsql as $$
begin
  if new.fulfilment = 'pickup' then
    new.delivery_fee_cents := 0; new.rider_id := null;
    new.renotified_at := coalesce(new.renotified_at, now()); new.bid_alerted_at := coalesce(new.bid_alerted_at, now());
  end if;
  return new;
end $$;
drop trigger if exists orders_b_pickup_insert on orders;
create trigger orders_b_pickup_insert before insert on orders for each row execute function fp_pickup_insert();

-- fulfilment is fixed once paid; pickup orders never get a rider
create or replace function public.fp_guard_pickup() returns trigger language plpgsql as $$
begin
  if new.fulfilment is distinct from old.fulfilment and (old.status not in ('awaiting_payment', 'payment_failed') or auth.uid() is not null and coalesce(my_role()::text, '') <> 'admin') then
    raise exception 'pickup/delivery cannot be changed after ordering';
  end if;
  if new.fulfilment = 'pickup' and new.rider_id is not null then raise exception 'pickup orders have no rider'; end if;
  if new.fulfilment = 'pickup' then new.delivery_fee_cents := 0; end if;
  return new;
end $$;
drop trigger if exists orders_guard_pickup on orders;
create trigger orders_guard_pickup before update on orders for each row execute function fp_guard_pickup();

create or replace function public.fp_no_bids_on_pickup() returns trigger language plpgsql as $$
begin
  if exists (select 1 from orders where id = new.order_id and fulfilment = 'pickup') then raise exception 'pickup orders have no rider'; end if;
  return new;
end $$;
drop trigger if exists bids_a_no_pickup on bids;
create trigger bids_a_no_pickup before insert on bids for each row execute function fp_no_bids_on_pickup();

-- transitions: pickup = placed -> accepted -> ready -> delivered (collected, by the restaurant)
create or replace function public.enforce_order_transition() returns trigger language plpgsql set search_path to 'public' as $function$
declare ok boolean; is_user boolean := current_user = 'authenticated'; is_admin boolean; pickup boolean := new.fulfilment = 'pickup';
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
    if new.status in ('accepted', 'ready') and my_restaurant() is distinct from old.restaurant_id then
      raise exception 'only the restaurant can mark the order %', new.status;
    elsif pickup and new.status = 'delivered' and my_restaurant() is distinct from old.restaurant_id then
      raise exception 'only the restaurant can mark a pickup order collected';
    elsif not pickup and new.status in ('picked_up', 'delivered') and old.rider_id is distinct from auth.uid() then
      raise exception 'only the assigned rider can mark the order %', new.status;
    elsif new.status = 'cancelled' and not (old.status = 'placed' and my_restaurant() = old.restaurant_id) then
      raise exception 'only the restaurant (before accepting) or an admin can cancel an order';
    elsif new.status in ('placed', 'payment_failed', 'awaiting_payment', 'assigned') then
      raise exception 'status % is set by the system', new.status;
    end if;
  end if;

  if new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancel_reason := coalesce(nullif(new.cancel_reason, ''),
      case when is_admin then 'admin_cancelled' when is_user then 'restaurant_rejected' else 'system' end);
  end if;
  return new;
end $function$;

-- SMS trigger: also on "ready" (the function only texts pickup orders for that status)
create or replace function public.notify_order_sms() returns trigger language plpgsql security definer set search_path to 'public', 'extensions' as $function$
begin
  if new.status is distinct from old.status and new.status in ('assigned', 'picked_up', 'delivered', 'ready') then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-sms',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000
    );
  end if;
  return new;
end $function$;

-- key metric (fast bid + on time) is about delivery: pickup orders are excluded
create or replace function public.report_key_metric(p_from timestamp with time zone, p_to timestamp with time zone, p_include_test boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $function$
declare res jsonb;
begin
  perform assert_admin();
  with f as (
    select f.*, (f.fast_bid is true and f.on_time is true) as hit,
           (o.paid_at is not null) as was_paid,
           (f.created_at at time zone 'Europe/Amsterdam')::date as day
    from order_facts f join orders o on o.id = f.id
    where f.created_at >= p_from and f.created_at < p_to and (p_include_test or not f.is_test) and o.fulfilment = 'delivery'
  ), p as (select * from f where was_paid)
  select jsonb_build_object(
    'target_pct', 80,
    'excludes', 'pickup',
    'pickup_orders', (select count(*) from orders o where o.fulfilment = 'pickup' and o.paid_at is not null and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not o.is_test)),
    'paid', (select count(*) from p),
    'hits', (select count(*) from p where hit),
    'pct', (select round(100.0 * count(*) filter (where hit) / nullif(count(*), 0), 1) from p),
    'pct_fast_bid', (select round(100.0 * count(*) filter (where fast_bid) / nullif(count(*), 0), 1) from p),
    'pct_on_time', (select round(100.0 * count(*) filter (where on_time) / nullif(count(*) filter (where status = 'delivered'), 0), 1) from p),
    'no_bid', (select count(*) from p where bid_at is null),
    'cancelled_after_payment', (select count(*) from p where status = 'cancelled'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'paid', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1)) order by day)
       from (select day, count(*) n, count(*) filter (where hit) h from p group by day) d), '[]'::jsonb),
    'by_restaurant', coalesce((select jsonb_agg(jsonb_build_object('restaurant', restaurant_name, 'paid', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1), 'avg_bid_seconds', s) order by n desc, restaurant_name)
       from (select restaurant_name, count(*) n, count(*) filter (where hit) h, round(avg(bid_seconds)) s from p group by restaurant_name) d), '[]'::jsonb),
    'by_rider', coalesce((select jsonb_agg(jsonb_build_object('rider', coalesce(rider_name, '—'), 'jobs', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1), 'on_time', ot) order by n desc)
       from (select rider_name, count(*) n, count(*) filter (where hit) h, count(*) filter (where on_time) ot from p where rider_id is not null group by rider_name) d), '[]'::jsonb)
  ) into res;
  return res;
end $function$;
