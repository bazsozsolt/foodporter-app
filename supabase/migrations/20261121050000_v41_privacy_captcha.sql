-- v41 (NOT applied live in this PR): hide delivery addresses from unassigned riders;
-- move labour/payroll/commission settings off the public settings read;
-- drop unused leftover posts/comments tables (contents backed up by the operator first).
-- Captcha is a client-side flag only; this migration does not touch Auth.

-- ---------------------------------------------------------------------------
-- Neighbourhood label: postcode (4 digits) + city, never street or house number
-- ---------------------------------------------------------------------------
create or replace function public.fp_neighbourhood(p_address text, p_distance_km numeric default null)
returns text
language plpgsql
immutable
as $$
declare
  pc text;
  city text;
  label text;
begin
  pc := (regexp_match(coalesce(p_address, ''), '([0-9]{4})(?:\s*[A-Z]{2})?'))[1];
  city := (regexp_match(coalesce(p_address, ''),
    '(?i)\y(Tilburg|Goirle|Berkel-Enschot|Udenhout|Breda|Waalwijk|Oisterwijk|Loon op Zand)\y'))[1];
  if city is not null then
    city := initcap(city);
  end if;
  label := trim(both ' ,' from concat_ws(', ', pc, city));
  if label = '' then
    label := 'Tilburg';
  end if;
  if p_distance_km is not null then
    label := label || ' · ' || replace(to_char(round(p_distance_km, 1), 'FM9990.0'), '.', ',') || ' km';
  end if;
  return label;
end;
$$;

revoke all on function public.fp_neighbourhood(text, numeric) from public;
grant execute on function public.fp_neighbourhood(text, numeric) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Bid-board view: no address, phone, customer, or exact coordinates
-- ---------------------------------------------------------------------------
create or replace view public.rider_bid_orders
  with (security_invoker = true)
as
select
  o.id,
  o.restaurant_id,
  o.status,
  o.fulfilment,
  o.subtotal_cents,
  o.delivery_fee_cents,
  o.service_fee_cents,
  o.tip_cents,
  o.rider_bonus_cents,
  o.prep_minutes,
  o.ready_at,
  o.created_at,
  o.renotified_at,
  o.bid_window_closes_at,
  o.is_test,
  o.stacked,
  o.distance_km,
  public.fp_neighbourhood(o.address, o.distance_km) as neighbourhood,
  true as address_hidden
from public.orders o
where o.status = 'accepted'
  and o.rider_id is null
  and o.fulfilment is distinct from 'pickup';

grant select on public.rider_bid_orders to authenticated;
revoke all on public.rider_bid_orders from anon, public;

-- Cannot ENABLE ROW LEVEL SECURITY on a view (Postgres rejects it). The
-- intermediate invoker view is dropped next; riders read the bid board through
-- the SECURITY DEFINER function / view that follows, and orders RLS is tightened.

-- Underlying orders RLS currently lets active riders SELECT every accepted
-- unassigned order (including address). Replace that with assigned-only access
-- on the base table, and expose the bid board through a SECURITY DEFINER view
-- that only returns the masked columns.

drop view if exists public.rider_bid_orders;

create or replace function public.fp_rider_bid_board()
returns table (
  id bigint,
  restaurant_id uuid,
  status public.order_status,
  fulfilment text,
  subtotal_cents integer,
  delivery_fee_cents integer,
  service_fee_cents integer,
  tip_cents integer,
  rider_bonus_cents integer,
  prep_minutes integer,
  ready_at timestamptz,
  created_at timestamptz,
  renotified_at timestamptz,
  bid_window_closes_at timestamptz,
  is_test boolean,
  stacked boolean,
  distance_km numeric,
  neighbourhood text,
  address_hidden boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.restaurant_id,
    o.status,
    o.fulfilment,
    o.subtotal_cents,
    o.delivery_fee_cents,
    o.service_fee_cents,
    o.tip_cents,
    o.rider_bonus_cents,
    o.prep_minutes,
    o.ready_at,
    o.created_at,
    o.renotified_at,
    o.bid_window_closes_at,
    o.is_test,
    o.stacked,
    o.distance_km,
    public.fp_neighbourhood(o.address, o.distance_km),
    true
  from public.orders o
  where o.status = 'accepted'
    and o.rider_id is null
    and o.fulfilment is distinct from 'pickup'
    and public.my_role() = 'rider'
    and public.my_status() = 'active'
    and (o.is_test is not distinct from coalesce((select p.is_test from profiles p where p.id = auth.uid()), false));
$$;

revoke all on function public.fp_rider_bid_board() from public, anon;
grant execute on function public.fp_rider_bid_board() to authenticated;

create or replace view public.rider_bid_orders as
  select * from public.fp_rider_bid_board();

grant select on public.rider_bid_orders to authenticated;
revoke all on public.rider_bid_orders from anon, public;

-- Base table: riders no longer see unassigned accepted rows (so address is hidden)
drop policy if exists "orders visible to parties" on public.orders;
create policy "orders visible to parties" on public.orders for select to authenticated using (
  (customer_id = (select auth.uid()))
  or ((restaurant_id = (select my_restaurant())) and (status <> all (array['awaiting_payment'::order_status, 'payment_failed'::order_status])))
  or (rider_id = (select auth.uid()))
  or ((select my_role()) = 'admin'::user_role)
);

-- Bidding would otherwise fail (EXISTS on orders is subject to RLS). Use definer helpers.
-- Pickup orders are not in the bid pool and must also be rejected here so a crafted insert cannot bid on them.
create or replace function public.fp_bid_order_open(p_order bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and o.status = 'accepted'
      and o.rider_id is null
      and o.fulfilment is distinct from 'pickup'
      and (o.bid_window_closes_at is null or o.bid_window_closes_at > now())
  );
$$;

revoke all on function public.fp_bid_order_open(bigint) from public, anon;
grant execute on function public.fp_bid_order_open(bigint) to authenticated;

drop policy if exists "bids insert" on public.bids;
create policy "bids insert" on public.bids for insert to authenticated with check (
  (
    rider_id = (select auth.uid())
    and (select my_role()) = 'rider'::user_role
    and (select my_status()) = 'active'
    and accepted = false
    and public.fp_bid_order_open(order_id)
    and public.fp_may_bid(order_id)
  )
  or (select my_role()) = 'admin'::user_role
);

-- ---------------------------------------------------------------------------
-- Settings: public / partner / work views; labour stays on the base table
-- ---------------------------------------------------------------------------
create or replace view public.settings_public
  with (security_invoker = true)
as
select
  id,
  delivery_fee_cents,
  zone_radius_km,
  bid_window_seconds,
  restaurant_accept_minutes,
  zone_center_lat,
  zone_center_lng,
  auction_seconds,
  max_active_orders,
  service_fee_cents,
  delivery_fee_bands,
  service_fee_on_pickup,
  fee_distance_basis,
  rider_bonus_cents,
  min_delivery_order_cents,
  stale_assignment_minutes
from public.settings;

create or replace view public.settings_partner
  with (security_invoker = true)
as
select
  id,
  commission_delivery_pct,
  commission_intro_pct,
  commission_intro_months,
  commission_pickup_pct
from public.settings;

create or replace view public.settings_work
  with (security_invoker = true)
as
select
  id,
  atw_break_after_h,
  call_notice_days
from public.settings;

drop policy if exists "settings readable" on public.settings;
create policy "settings admin select" on public.settings for select to authenticated
  using ((select my_role()) = 'admin'::user_role);

-- The invoker views above document the intended columns, but they would become
-- empty for non-admins once the base table is admin-select only. Recreate them
-- over SECURITY DEFINER functions that return only those columns.
drop view if exists public.settings_public;
drop view if exists public.settings_partner;
drop view if exists public.settings_work;

create or replace function public.fp_settings_public()
returns table (
  id boolean,
  delivery_fee_cents integer,
  zone_radius_km numeric,
  bid_window_seconds integer,
  restaurant_accept_minutes integer,
  zone_center_lat double precision,
  zone_center_lng double precision,
  auction_seconds integer,
  max_active_orders integer,
  service_fee_cents integer,
  delivery_fee_bands jsonb,
  service_fee_on_pickup boolean,
  fee_distance_basis text,
  rider_bonus_cents integer,
  min_delivery_order_cents integer,
  stale_assignment_minutes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.delivery_fee_cents, s.zone_radius_km, s.bid_window_seconds, s.restaurant_accept_minutes,
    s.zone_center_lat, s.zone_center_lng, s.auction_seconds, s.max_active_orders, s.service_fee_cents,
    s.delivery_fee_bands, s.service_fee_on_pickup, s.fee_distance_basis, s.rider_bonus_cents,
    s.min_delivery_order_cents, s.stale_assignment_minutes
  from public.settings s;
$$;

create or replace function public.fp_settings_partner()
returns table (
  id boolean,
  commission_delivery_pct numeric,
  commission_intro_pct numeric,
  commission_intro_months integer,
  commission_pickup_pct numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.commission_delivery_pct, s.commission_intro_pct, s.commission_intro_months, s.commission_pickup_pct
  from public.settings s
  where public.my_role() in ('admin'::user_role, 'restaurant'::user_role);
$$;

create or replace function public.fp_settings_work()
returns table (
  id boolean,
  atw_break_after_h numeric,
  call_notice_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.atw_break_after_h, s.call_notice_days
  from public.settings s
  where public.my_role() in ('admin'::user_role, 'rider'::user_role);
$$;

create or replace view public.settings_public as select * from public.fp_settings_public();
create or replace view public.settings_partner as select * from public.fp_settings_partner();
create or replace view public.settings_work as select * from public.fp_settings_work();

revoke all on function public.fp_settings_public() from public;
revoke all on function public.fp_settings_partner() from public, anon;
revoke all on function public.fp_settings_work() from public, anon;
grant execute on function public.fp_settings_public() to anon, authenticated, service_role;
grant execute on function public.fp_settings_partner() to authenticated;
grant execute on function public.fp_settings_work() to authenticated;

grant select on public.settings_public to anon, authenticated, service_role;
grant select on public.settings_partner to authenticated;
grant select on public.settings_work to authenticated;
revoke all on public.settings_public from public;
revoke all on public.settings_partner from anon, public;
revoke all on public.settings_work from anon, public;

revoke insert, delete on public.settings from authenticated;
-- authenticated keeps UPDATE so the existing admin RLS policy can write; SELECT is now admin-only.

-- ---------------------------------------------------------------------------
-- Unused starter tables. Operator took a logical backup of all rows before apply.
-- 8 posts / 11 comments; FKs only to each other and public.users. No app code uses them.
-- ---------------------------------------------------------------------------
drop table if exists public.comments;
drop table if exists public.posts;
