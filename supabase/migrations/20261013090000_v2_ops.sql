-- Food Porter v2: zone/geocoding, status rules, timeouts (pg_cron), refunds, ops alerts, ratings, rider names

-- ===== Settings =====
alter table settings
  add column if not exists restaurant_accept_minutes int not null default 5 check (restaurant_accept_minutes between 1 and 30),
  add column if not exists no_bid_alert_minutes int not null default 10 check (no_bid_alert_minutes between 1 and 60),
  add column if not exists unpaid_expiry_minutes int not null default 30 check (unpaid_expiry_minutes between 10 and 240),
  add column if not exists zone_center_lat double precision not null default 51.5576,
  add column if not exists zone_center_lng double precision not null default 5.0913;

-- ===== Orders / restaurants geo + lifecycle columns =====
alter table orders
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists distance_km numeric(5,2),
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists renotified_at timestamptz,
  add column if not exists bid_alerted_at timestamptz,
  add column if not exists refund_id text,
  add column if not exists refund_status text,
  add column if not exists refund_cents int,
  add column if not exists refunded_at timestamptz;
alter table restaurants add column if not exists lat double precision, add column if not exists lng double precision;
update restaurants set lat = v.lat, lng = v.lng from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 51.5605, 5.0830),
  ('11111111-0000-4000-8000-000000000002'::uuid, 51.5530, 5.0990),
  ('11111111-0000-4000-8000-000000000003'::uuid, 51.5568, 5.0905),
  ('11111111-0000-4000-8000-000000000004'::uuid, 51.5500, 5.0740)) v(id, lat, lng)
where restaurants.id = v.id and restaurants.lat is null;

create or replace function fp_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable set search_path = public as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- ===== Field guard (non-admin users) =====
create or replace function guard_order_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.customer_id is distinct from old.customer_id
      or new.restaurant_id is distinct from old.restaurant_id
      or new.rider_id is distinct from old.rider_id
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.delivery_fee_cents is distinct from old.delivery_fee_cents
      or new.commission_cents is distinct from old.commission_cents
      or new.mollie_payment_id is distinct from old.mollie_payment_id
      or new.paid_at is distinct from old.paid_at
      or new.payment_status is distinct from old.payment_status
      or new.sms_sent is distinct from old.sms_sent
      or new.lat is distinct from old.lat or new.lng is distinct from old.lng or new.distance_km is distinct from old.distance_km
      or new.renotified_at is distinct from old.renotified_at or new.bid_alerted_at is distinct from old.bid_alerted_at
      or new.refund_id is distinct from old.refund_id or new.refund_status is distinct from old.refund_status
      or new.refund_cents is distinct from old.refund_cents or new.refunded_at is distinct from old.refunded_at
      or (new.cancel_reason is distinct from old.cancel_reason and new.status <> 'cancelled')
      or old.status in ('awaiting_payment', 'payment_failed') then
      raise exception 'not allowed to change these order fields';
    end if;
    if new.prep_minutes is distinct from old.prep_minutes
       and (old.status not in ('placed', 'accepted', 'assigned') or my_restaurant() is distinct from old.restaurant_id) then
      raise exception 'prep time can only be changed by the restaurant before the order is ready';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_order_update() from public, anon, authenticated;

-- ===== Status transition rules (no skipping) =====
create or replace function enforce_order_transition() returns trigger language plpgsql set search_path = public as $$
declare ok boolean; is_user boolean := current_user = 'authenticated'; is_admin boolean;
begin
  if new.status = old.status then return new; end if;
  is_admin := is_user and coalesce(my_role()::text, '') = 'admin';
  ok := case old.status
    when 'awaiting_payment' then new.status in ('placed', 'payment_failed', 'cancelled')
    when 'payment_failed'   then new.status in ('awaiting_payment', 'placed', 'cancelled')
    when 'placed'           then new.status in ('accepted', 'cancelled')
    when 'accepted'         then new.status in ('assigned', 'cancelled')
    when 'assigned'         then new.status in ('ready', 'cancelled')
    when 'ready'            then new.status in ('picked_up', 'cancelled')
    when 'picked_up'        then new.status = 'delivered' or (new.status = 'cancelled' and not is_user)
                                 or (new.status = 'cancelled' and is_admin)
    else false end;
  if not ok then raise exception 'invalid status change: % -> %', old.status, new.status; end if;

  if is_user and not is_admin then
    -- who may make which step
    if new.status in ('accepted', 'ready') and my_restaurant() is distinct from old.restaurant_id then
      raise exception 'only the restaurant can mark the order %', new.status;
    elsif new.status in ('picked_up', 'delivered') and old.rider_id is distinct from auth.uid() then
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
end $$;
revoke execute on function public.enforce_order_transition() from public, anon, authenticated;
drop trigger if exists orders_enforce_transition on orders;
create trigger orders_enforce_transition before update of status on orders for each row execute function enforce_order_transition();

-- ===== Ops alerts (admin only) =====
create table if not exists ops_alerts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('restaurant_timeout', 'no_bid', 'refund_failed', 'out_of_zone', 'other')),
  order_id bigint references orders(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table ops_alerts enable row level security;
drop policy if exists "admin ops alerts" on ops_alerts;
create policy "admin ops alerts" on ops_alerts for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create index if not exists ops_alerts_open_idx on ops_alerts(created_at) where resolved_at is null;

-- ===== Refund on cancellation of a paid order (calls order-refund Edge Function) =====
create or replace function notify_order_refund() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.paid_at is not null and new.refund_status is null then
    -- Body is only a hint; the function re-reads the order and claims the refund atomically.
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-refund',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
revoke execute on function public.notify_order_refund() from public, anon, authenticated;
drop trigger if exists orders_notify_refund on orders;
create trigger orders_notify_refund after update of status on orders for each row execute function notify_order_refund();

-- ===== Timeouts (run every minute by pg_cron) =====
create or replace function fp_run_timeouts() returns jsonb language plpgsql security definer set search_path = public as $$
declare s settings; n_exp int; n_rest int; n_renotify int; n_alert int;
begin
  select * into s from settings limit 1;
  update orders set status = 'payment_failed', payment_status = 'expired'
    where status = 'awaiting_payment' and created_at < now() - make_interval(mins => s.unpaid_expiry_minutes);
  get diagnostics n_exp = row_count;

  with c as (
    update orders set status = 'cancelled', cancel_reason = 'restaurant_timeout'
    where status = 'placed' and coalesce(paid_at, created_at) < now() - make_interval(mins => s.restaurant_accept_minutes)
    returning id)
  insert into ops_alerts(kind, order_id, message)
    select 'restaurant_timeout', id, format('Restaurant did not accept within %s min: order cancelled, refund started', s.restaurant_accept_minutes) from c;
  get diagnostics n_rest = row_count;

  update orders set renotified_at = now()
    where status = 'accepted' and rider_id is null and renotified_at is null
      and accepted_at < now() - make_interval(secs => s.bid_window_seconds);
  get diagnostics n_renotify = row_count;

  with a as (
    update orders set bid_alerted_at = now()
    where status = 'accepted' and rider_id is null and bid_alerted_at is null
      and accepted_at < now() - make_interval(mins => s.no_bid_alert_minutes)
    returning id)
  insert into ops_alerts(kind, order_id, message)
    select 'no_bid', id, format('No rider bid within %s min. Re-notified riders; consider calling riders or cancelling + refunding.', s.no_bid_alert_minutes) from a;
  get diagnostics n_alert = row_count;

  return jsonb_build_object('expired', n_exp, 'restaurant_timeouts', n_rest, 'renotified', n_renotify, 'no_bid_alerts', n_alert);
end $$;
revoke execute on function public.fp_run_timeouts() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'fp-timeouts';
select cron.schedule('fp-timeouts', '* * * * *', 'select public.fp_run_timeouts()');

-- ===== Rider display name (was "Rider") =====
create or replace function set_bid_rider_name() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(nullif(trim(p.full_name), ''), initcap(split_part(split_part(p.email, '@', 1), '.', 1)), 'Rider')
    into new.rider_name from profiles p where p.id = new.rider_id;
  new.rider_name := coalesce(new.rider_name, 'Rider');
  return new;
end $$;
revoke execute on function public.set_bid_rider_name() from public, anon, authenticated;
drop trigger if exists bids_set_rider_name on bids;
create trigger bids_set_rider_name before insert on bids for each row execute function set_bid_rider_name();
update bids b set rider_name = coalesce(nullif(trim(p.full_name), ''), initcap(split_part(split_part(p.email, '@', 1), '.', 1)), 'Rider')
  from profiles p where p.id = b.rider_id and b.rider_name = 'Rider';

-- ===== Ratings after delivery =====
create table if not exists ratings (
  order_id bigint primary key references orders(id) on delete cascade,
  customer_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  food_stars int not null check (food_stars between 1 and 5),
  rider_stars int check (rider_stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
alter table ratings enable row level security;
drop policy if exists "customer rates delivered order" on ratings;
create policy "customer rates delivered order" on ratings for insert to authenticated with check (
  customer_id = auth.uid() and exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'delivered'));
drop policy if exists "ratings visible to parties" on ratings;
create policy "ratings visible to parties" on ratings for select to authenticated using (
  customer_id = auth.uid() or my_role() = 'admin'
  or exists (select 1 from orders o where o.id = order_id and (o.restaurant_id = my_restaurant() or o.rider_id = auth.uid())));
drop policy if exists "admin ratings" on ratings;
create policy "admin ratings" on ratings for delete to authenticated using (my_role() = 'admin');

-- ===== order_facts: append rating / cancel / refund / distance columns =====
create or replace view order_facts with (security_invoker = true) as
SELECT o.id, o.created_at, o.status, o.restaurant_id, r.name AS restaurant_name, o.rider_id, o.customer_id,
    o.subtotal_cents, o.delivery_fee_cents, COALESCE(r.commission_pct, 12::numeric) AS commission_pct,
    round(o.subtotal_cents::numeric * COALESCE(r.commission_pct, 12::numeric) / 100.0)::integer AS commission_cents,
    o.prep_minutes, o.accepted_at, o.ready_at, o.delivered_at, o.paid_at, o.restaurant_payout_id,
    b.created_at AS bid_at, b.eta_minutes, b.rider_name,
    EXTRACT(epoch FROM b.created_at - o.accepted_at)::integer AS bid_seconds,
    (b.created_at - o.accepted_at) <= '00:03:00'::interval AS fast_bid,
    o.delivered_at <= (b.created_at + make_interval(mins => b.eta_minutes)) AS on_time,
    CASE WHEN o.delivered_at IS NOT NULL AND b.created_at IS NOT NULL
      THEN EXTRACT(epoch FROM o.delivered_at - (b.created_at + make_interval(mins => b.eta_minutes)))::integer / 60 ELSE NULL::integer END AS minutes_late,
    CASE WHEN o.status = ANY (ARRAY['ready'::order_status, 'picked_up'::order_status, 'delivered'::order_status]) AND o.accepted_at IS NOT NULL AND o.ready_at IS NOT NULL
      THEN round(EXTRACT(epoch FROM o.ready_at - o.accepted_at) / 60.0, 1) ELSE NULL::numeric END AS actual_prep_minutes,
    (SELECT count(*) FROM audit_events e WHERE e.order_id = o.id AND e.type = 'prep_extended')::integer AS prep_extensions,
    o.status <> ALL (ARRAY['awaiting_payment'::order_status, 'payment_failed'::order_status, 'cancelled'::order_status]) AS is_paid,
    o.address ~~ 'FP TEST%' AS is_test,
    EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') >= 22
      OR EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') < 6 AS late_night,
    rt.food_stars, rt.rider_stars, o.cancel_reason, o.refund_status, o.refund_cents, o.distance_km
FROM orders o
LEFT JOIN restaurants r ON r.id = o.restaurant_id
LEFT JOIN bids b ON b.order_id = o.id AND b.accepted
LEFT JOIN ratings rt ON rt.order_id = o.id;

-- ===== Quality report with ratings, refunds, timeouts =====
create or replace function report_quality(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
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
end $$;
revoke execute on function public.report_quality(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_quality(timestamptz, timestamptz) to authenticated;
