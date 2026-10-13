-- Food Porter v3: 10-20 km zone, 60 s bid auction (lowest ETA wins), restaurant rating counters,
-- live rider locations (RLS-restricted, purged after 7 days), late-payment refunds.

-- ===== 1) Zone radius 10-20 km (default 15) =====
alter table settings drop constraint if exists settings_zone_radius_km_check;
update settings set zone_radius_km = 15 where zone_radius_km < 10 or zone_radius_km > 20;
alter table settings alter column zone_radius_km set default 15;
alter table settings add constraint settings_zone_radius_km_check check (zone_radius_km between 10 and 20);

-- ===== 3) Ratings: public counters on restaurants (only real ratings) =====
alter table restaurants add column if not exists rating_avg numeric(3,2), add column if not exists rating_count int not null default 0;
create or replace function refresh_restaurant_rating() returns trigger language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  select restaurant_id into rid from orders where id = coalesce(new.order_id, old.order_id);
  update restaurants r set
    rating_count = (select count(*) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = rid),
    rating_avg = (select round(avg(rt.food_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = rid)
  where r.id = rid;
  return null;
end $$;
revoke execute on function public.refresh_restaurant_rating() from public, anon, authenticated;
drop trigger if exists ratings_refresh_restaurant on ratings;
create trigger ratings_refresh_restaurant after insert or update or delete on ratings for each row execute function refresh_restaurant_rating();
-- ratings: one per order (PK), only by the ordering customer after delivery (policy from v2). Ratings are immutable for customers.
-- restaurant rating columns are system-maintained
create or replace function guard_restaurant_rating() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (new.rating_avg is distinct from old.rating_avg or new.rating_count is distinct from old.rating_count) then
    raise exception 'rating counters are maintained by the system';
  end if;
  return new;
end $$;
revoke execute on function public.guard_restaurant_rating() from public, anon, authenticated;
drop trigger if exists restaurants_guard_rating on restaurants;
create trigger restaurants_guard_rating before update on restaurants for each row execute function guard_restaurant_rating();

-- ===== 5) Bid auction: window opens with the first bid, lowest ETA wins, ties -> earliest =====
alter table settings add column if not exists auction_seconds int not null default 60 check (auction_seconds between 15 and 300);
alter table orders add column if not exists bid_window_closes_at timestamptz;

create or replace function open_bid_window() returns trigger language plpgsql security definer set search_path = public as $$
declare secs int;
begin
  select auction_seconds into secs from settings limit 1;
  update orders set bid_window_closes_at = now() + make_interval(secs => coalesce(secs, 60))
    where id = new.order_id and bid_window_closes_at is null;
  return null;
end $$;
revoke execute on function public.open_bid_window() from public, anon, authenticated;
drop trigger if exists bids_open_window on bids;
create trigger bids_open_window after insert on bids for each row execute function open_bid_window();

-- Riders may only bid on open orders while the window is open
drop policy if exists "riders bid" on bids;
create policy "riders bid" on bids for insert to authenticated with check (
  rider_id = auth.uid() and my_role() = 'rider' and my_status() = 'active' and accepted = false
  and exists (select 1 from orders o where o.id = order_id and o.status = 'accepted' and o.rider_id is null
              and (o.bid_window_closes_at is null or o.bid_window_closes_at > now())));

-- Resolve closed windows (pg_cron every 5 s; also callable by parties to settle immediately)
create or replace function fp_resolve_bids(p_order bigint default null) returns int language plpgsql security definer set search_path = public as $$
declare o record; w bids; n int := 0;
begin
  for o in select id from orders where status = 'accepted' and rider_id is null and bid_window_closes_at <= now()
           and (p_order is null or id = p_order) for update skip locked loop
    select * into w from bids where order_id = o.id and not accepted
      and rider_id in (select id from profiles where status = 'active')
      order by eta_minutes asc, created_at asc, id asc limit 1;
    if found then
      update bids set accepted = true where id = w.id;
      update orders set rider_id = w.rider_id, status = 'assigned', assigned_at = now() where id = o.id;
      n := n + 1;
    else
      update orders set bid_window_closes_at = null where id = o.id; -- all bidders gone: reopen
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.fp_resolve_bids(bigint) from public, anon, authenticated;

-- accept_bid: no longer callable by clients (the auction decides)
revoke execute on function public.accept_bid(uuid) from authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'fp-resolve-bids';
select cron.schedule('fp-resolve-bids', '5 seconds', 'select public.fp_resolve_bids()');

-- Reports: "time to accepted bid" = accepted -> assigned (auction close); on time = delivered by assigned_at + ETA
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
    o.address ~~ 'FP TEST%' AS is_test,
    EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') >= 22
      OR EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') < 6 AS late_night,
    rt.food_stars, rt.rider_stars, o.cancel_reason, o.refund_status, o.refund_cents, o.distance_km
FROM orders o
LEFT JOIN restaurants r ON r.id = o.restaurant_id
LEFT JOIN bids b ON b.order_id = o.id AND b.accepted
LEFT JOIN ratings rt ON rt.order_id = o.id;

-- non-admins may not touch the auction column
create or replace function guard_bid_window() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin'
     and new.bid_window_closes_at is distinct from old.bid_window_closes_at then
    raise exception 'not allowed to change the bid window';
  end if;
  return new;
end $$;
revoke execute on function public.guard_bid_window() from public, anon, authenticated;
drop trigger if exists orders_guard_bid_window on orders;
create trigger orders_guard_bid_window before update on orders for each row execute function guard_bid_window();

-- ===== 4) Live rider locations =====
alter table profiles add column if not exists online boolean not null default false,
  add column if not exists location_consent_at timestamptz;

create table if not exists rider_locations (
  id bigint generated always as identity primary key,
  rider_id uuid not null references profiles(id) on delete cascade,
  order_id bigint references orders(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real, heading real, speed_mps real,
  created_at timestamptz not null default now()
);
create index if not exists rider_locations_order_idx on rider_locations(order_id, created_at desc);
create index if not exists rider_locations_rider_idx on rider_locations(rider_id, created_at desc);
alter table rider_locations enable row level security;

-- Insert: own point, active rider with consent, and either "online" (no order) or on an active job they hold.
-- Throttle: at most one point per 5 s per rider (enforced by trigger below).
drop policy if exists "rider shares own location" on rider_locations;
create policy "rider shares own location" on rider_locations for insert to authenticated with check (
  rider_id = auth.uid() and my_role() = 'rider' and my_status() = 'active'
  and exists (select 1 from profiles p where p.id = auth.uid() and p.location_consent_at is not null)
  and (order_id is null or exists (select 1 from orders o where o.id = order_id and o.rider_id = auth.uid()
                                   and o.status in ('assigned', 'ready', 'picked_up'))));
-- Read: the rider, admins, and the order's customer/restaurant while the job is active
drop policy if exists "locations visible to order parties" on rider_locations;
create policy "locations visible to order parties" on rider_locations for select to authenticated using (
  rider_id = auth.uid() or my_role() = 'admin'
  or (order_id is not null and exists (select 1 from orders o where o.id = order_id
        and o.status in ('assigned', 'ready', 'picked_up')
        and (o.customer_id = auth.uid() or o.restaurant_id = my_restaurant()))));
drop policy if exists "admin locations" on rider_locations;
create policy "admin locations" on rider_locations for delete to authenticated using (my_role() = 'admin');

create or replace function throttle_rider_location() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from rider_locations where rider_id = new.rider_id and created_at > now() - interval '4.5 seconds') then
    return null; -- silently drop points that come too fast
  end if;
  return new;
end $$;
revoke execute on function public.throttle_rider_location() from public, anon, authenticated;
drop trigger if exists rider_locations_throttle on rider_locations;
create trigger rider_locations_throttle before insert on rider_locations for each row execute function throttle_rider_location();

-- Going offline is the rider's choice; consent timestamp can only be set by the rider themselves (allowed by own-profile policy).
alter publication supabase_realtime add table rider_locations;

-- Purge after 7 days (daily 03:15 UTC)
create or replace function fp_purge_locations() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from rider_locations where created_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fp_purge_locations() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'fp-purge-locations';
select cron.schedule('fp-purge-locations', '15 3 * * *', 'select public.fp_purge_locations()');

-- ===== 6) Late payments / duplicate payments =====
alter table ops_alerts drop constraint if exists ops_alerts_kind_check;
alter table ops_alerts add constraint ops_alerts_kind_check check (kind in ('restaurant_timeout', 'no_bid', 'refund_failed', 'out_of_zone', 'late_payment', 'other'));
