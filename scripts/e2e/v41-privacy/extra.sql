-- Extra schema and seed so the v41 migration can be applied on top of the
-- v40 local fixture (stands in for live main). Local only.

create or replace function public.my_status()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select status from public.profiles where id = auth.uid()
$$;
create or replace function public.my_restaurant()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;
-- Stub: no stacking conflicts in this harness. Returns null = may bid.
create or replace function public.fp_stack_reason(p_rider uuid, p_order bigint)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select null::text
$$;
create or replace function public.fp_may_bid(p_order bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.fp_stack_reason(auth.uid(), p_order) is null
$$;

revoke all on function public.my_status() from public, anon;
revoke all on function public.my_restaurant() from public, anon;
revoke all on function public.fp_stack_reason(uuid, bigint) from public, anon;
revoke all on function public.fp_may_bid(bigint) from public, anon;
grant execute on function public.my_status() to authenticated, service_role;
grant execute on function public.my_restaurant() to authenticated, service_role;
grant execute on function public.fp_stack_reason(uuid, bigint) to authenticated, service_role;
grant execute on function public.fp_may_bid(bigint) to authenticated, service_role;

alter table public.orders
  add column if not exists phone text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists distance_km numeric,
  add column if not exists prep_minutes int,
  add column if not exists ready_at timestamptz,
  add column if not exists renotified_at timestamptz,
  add column if not exists bid_window_closes_at timestamptz,
  add column if not exists assigned_at timestamptz;

alter table public.settings
  add column if not exists zone_radius_km numeric,
  add column if not exists bid_window_seconds int,
  add column if not exists restaurant_accept_minutes int,
  add column if not exists zone_center_lat double precision,
  add column if not exists zone_center_lng double precision,
  add column if not exists auction_seconds int,
  add column if not exists max_active_orders int,
  add column if not exists service_fee_cents int,
  add column if not exists delivery_fee_bands jsonb,
  add column if not exists service_fee_on_pickup boolean,
  add column if not exists fee_distance_basis text,
  add column if not exists rider_bonus_cents int,
  add column if not exists min_delivery_order_cents int,
  add column if not exists stale_assignment_minutes int,
  add column if not exists commission_delivery_pct numeric,
  add column if not exists commission_intro_pct numeric,
  add column if not exists commission_intro_months int,
  add column if not exists commission_pickup_pct numeric,
  add column if not exists default_contract_kind text,
  add column if not exists minmax_default_min_h numeric,
  add column if not exists minmax_default_max_h numeric,
  add column if not exists wml_cents jsonb,
  add column if not exists wml_effective date,
  add column if not exists holiday_pay_pct numeric,
  add column if not exists holiday_hours_pct numeric,
  add column if not exists atw_max_shift_h numeric,
  add column if not exists atw_max_shift_youth_h numeric,
  add column if not exists atw_break_after_h numeric,
  add column if not exists atw_week_max_h numeric,
  add column if not exists atw_week_max_youth_h numeric,
  add column if not exists atw_break_after_youth_h numeric,
  add column if not exists cao text,
  add column if not exists cao_avv_until date,
  add column if not exists cao_scale_cents int,
  add column if not exists surcharge_sat_pct numeric,
  add column if not exists surcharge_sun_pct numeric,
  add column if not exists surcharge_holiday_pct numeric,
  add column if not exists surcharge_night_pct numeric,
  add column if not exists night_from time,
  add column if not exists night_to time,
  add column if not exists overtime_pct numeric,
  add column if not exists overtime_week_h numeric,
  add column if not exists min_call_hours numeric,
  add column if not exists call_notice_days int,
  add column if not exists rest_min_h numeric,
  add column if not exists pension_fund text,
  add column if not exists pension_employee_pct numeric,
  add column if not exists pension_employer_pct numeric,
  add column if not exists payroll_provider text,
  add column if not exists no_bid_alert_minutes int,
  add column if not exists unpaid_expiry_minutes int,
  add column if not exists updated_at timestamptz;

update public.settings set
  zone_radius_km = 5,
  bid_window_seconds = 180,
  restaurant_accept_minutes = 5,
  zone_center_lat = 51.5576,
  zone_center_lng = 5.0913,
  auction_seconds = 60,
  max_active_orders = 2,
  service_fee_cents = 99,
  delivery_fee_bands = '[{"max_km":2,"fee_cents":249},{"max_km":4,"fee_cents":349},{"max_km":8,"fee_cents":499}]'::jsonb,
  service_fee_on_pickup = false,
  fee_distance_basis = 'restaurant',
  rider_bonus_cents = 50,
  min_delivery_order_cents = 1500,
  stale_assignment_minutes = 180,
  commission_delivery_pct = 25,
  commission_intro_pct = 20,
  commission_intro_months = 3,
  commission_pickup_pct = 10,
  default_contract_kind = 'min_max',
  minmax_default_min_h = 8,
  minmax_default_max_h = 16,
  wml_cents = '{"21": 1499}'::jsonb,
  holiday_pay_pct = 8,
  atw_break_after_h = 4.5,
  atw_max_shift_h = 12,
  cao_scale_cents = 1471,
  call_notice_days = 4,
  payroll_provider = 'secret-payroll-co',
  pension_fund = 'secret-pension'
where id = true;

create table if not exists public.users (id uuid primary key);
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id),
  title text,
  body text,
  created_at timestamptz default now()
);
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  post_id bigint references public.posts(id),
  user_id uuid references public.users(id),
  body text,
  created_at timestamptz default now()
);
insert into public.users(id) values ('00000000-0000-0000-0000-000000000099')
  on conflict do nothing;
insert into public.posts(user_id, title, body) values
  ('00000000-0000-0000-0000-000000000099', 'hello', 'starter post');
insert into public.comments(post_id, user_id, body)
  select id, '00000000-0000-0000-0000-000000000099', 'starter comment' from public.posts limit 1;

create table if not exists public.bids (
  id bigint generated always as identity primary key,
  order_id bigint not null references public.orders(id),
  rider_id uuid not null,
  eta_minutes int not null,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.bids enable row level security;
grant all on public.bids to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

drop policy if exists "bids visible" on public.bids;
drop policy if exists "bids insert" on public.bids;
create policy "bids visible" on public.bids for select to authenticated
  using (
    rider_id = auth.uid()
    or my_role() = 'admin'
    or exists (
      select 1 from orders o
      where o.id = bids.order_id
        and (o.customer_id = auth.uid() or o.restaurant_id = my_restaurant())
    )
  );
create policy "bids insert" on public.bids for insert to authenticated
  with check (
    (
      rider_id = auth.uid()
      and my_role() = 'rider'
      and my_status() = 'active'
      and accepted = false
      and exists (
        select 1 from orders o
        where o.id = bids.order_id
          and o.status = 'accepted'
          and o.rider_id is null
          and (o.bid_window_closes_at is null or o.bid_window_closes_at > now())
      )
      and fp_may_bid(order_id)
    )
    or my_role() = 'admin'
  );

insert into public.restaurants(id, name) values
  ('00000000-0000-0000-0000-0000000000cc', 'Other Kitchen')
on conflict do nothing;

insert into public.profiles(id, role, full_name, email, restaurant_id, status, is_test) values
  ('00000000-0000-0000-0000-000000000006', 'rider', 'Una Unassigned', 'una@example.com', null, 'active', false),
  ('00000000-0000-0000-0000-000000000007', 'rider', 'Oth OtherRider', 'oth@example.com', null, 'active', false),
  ('00000000-0000-0000-0000-000000000008', 'rider', 'Tess TestRider', 'tess@example.com', null, 'active', true),
  ('00000000-0000-0000-0000-00000000000a', 'rider', 'Off OfflineRider', 'off@example.com', null, 'inactive', false),
  ('00000000-0000-0000-0000-000000000009', 'restaurant', 'Omar OtherRest', 'omar@example.com', '00000000-0000-0000-0000-0000000000cc', 'active', false)
on conflict (id) do nothing;

-- Bid-pool and assignment cases (Cara is the customer unless noted)
insert into public.orders(
  id, customer_id, restaurant_id, rider_id, status, fulfilment,
  subtotal_cents, delivery_fee_cents, service_fee_cents, tip_cents, rider_bonus_cents,
  address, phone, lat, lng, distance_km, is_test, prep_minutes, created_at, paid_at, assigned_at, delivered_at
) values
  -- 3001: open delivery bid, real, street address must stay hidden from unassigned riders
  (3001, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', null, 'accepted', 'delivery',
   1800, 249, 99, 0, 50, 'Heuvelstraat 12, 5038 AA Tilburg', '0611111111', 51.5555, 5.0913, 1.2, false, 10,
   now(), now(), null, null),
  -- 3002: accepted pickup — must not appear on the bid board
  (3002, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', null, 'accepted', 'pickup',
   1800, 0, 99, 0, 0, 'Afhalen bij Cafe Real', null, null, null, null, false, 10,
   now(), now(), null, null),
  -- 3003: open test bid — only a test rider should see it on the board
  (3003, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000bb', null, 'accepted', 'delivery',
   1600, 249, 99, 0, 50, 'FP TEST: Spoorlaan 99, 5014 EA Tilburg', '0622222222', 51.56, 5.09, 2.5, true, 10,
   now(), now(), null, null),
  -- 3004: assigned to Rik (003)
  (3004, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-000000000003', 'assigned', 'delivery',
   1800, 249, 99, 100, 50, 'Nieuwlandstraat 5, 5038 SK Tilburg', '0633333333', 51.557, 5.09, 0.8, false, 10,
   now(), now(), now(), null),
  -- 3005: delivered by Rik
  (3005, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-000000000003', 'delivered', 'delivery',
   1800, 249, 99, 0, 50, 'Piusstraat 20, 5038 WL Tilburg', '0644444444', 51.558, 5.092, 1.0, false, 10,
   now() - interval '2 hours', now() - interval '2 hours', now() - interval '90 minutes', now() - interval '10 minutes'),
  -- 3006: assigned to Other rider (007) — used to check reassignment leftovers
  (3006, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-000000000007', 'assigned', 'delivery',
   1700, 249, 99, 0, 50, 'Korvelseweg 8, 5025 JD Tilburg', '0655555555', 51.55, 5.08, 3.1, false, 10,
   now(), now(), now(), null),
  -- 3007: other restaurant's accepted bid-pool order
  (3007, '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000cc', null, 'accepted', 'delivery',
   1900, 249, 99, 0, 50, 'Bredaseweg 1, 5037 TN Tilburg', '0666666666', 51.54, 5.07, 4.0, false, 10,
   now(), now(), null, null)
on conflict (id) do nothing;

-- Live main already has an admin write policy on settings; v41 keeps UPDATE
-- granted so this policy can still write. The v40 fixture only had a public
-- select policy, so add the write policy here before v41 runs.
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings for update to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- Authenticated needs SELECT grant on settings so admin RLS can still read the
-- base table (v41 only tightens the policy, not this grant). Already granted.
