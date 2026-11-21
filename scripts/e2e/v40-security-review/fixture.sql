-- Minimal local schema for the v40 security-review migration + RLS negatives.
-- Does not talk to the live project.

create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('customer','rider','restaurant','admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('awaiting_payment','payment_failed','placed','accepted','assigned','ready','picked_up','delivered','cancelled');
  end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.profiles (
  id uuid primary key,
  role user_role not null default 'customer',
  full_name text,
  email text,
  restaurant_id uuid,
  status text not null default 'active',
  is_test boolean not null default false
);
create table public.restaurants (
  id uuid primary key,
  name text not null,
  partner_since date
);
create table public.orders (
  id bigint primary key,
  customer_id uuid,
  restaurant_id uuid,
  rider_id uuid,
  status order_status not null,
  subtotal_cents int not null default 0,
  delivery_fee_cents int not null default 0,
  service_fee_cents int not null default 0,
  tip_cents int not null default 0,
  commission_cents int not null default 0,
  refund_cents int,
  refund_id text,
  refund_status text,
  address text,
  is_test boolean not null default false,
  stacked boolean not null default false,
  fulfilment text not null default 'delivery',
  restaurant_payout_id uuid,
  paid_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  cancel_reason text
);
create table public.earnings (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null,
  order_id bigint not null,
  amount_cents int not null,
  tip_cents int not null default 0,
  payout_id uuid,
  earned_at timestamptz not null default now()
);
create table public.incidents (
  id bigint generated always as identity primary key,
  restaurant_id uuid,
  type text,
  severity text,
  status text,
  is_test boolean not null default false,
  occurred_at timestamptz not null default now()
);
create table public.ratings (
  order_id bigint primary key,
  food_stars int,
  rider_stars int
);
create table public.audit_events (
  id bigint generated always as identity primary key,
  order_id bigint,
  profile_id uuid,
  type text,
  from_value text,
  to_value text,
  actor uuid,
  created_at timestamptz not null default now()
);
create table public.ops_alerts (
  id bigint generated always as identity primary key,
  kind text,
  order_id bigint,
  created_at timestamptz not null default now()
);
create table public.rider_hr (
  profile_id uuid primary key,
  contract_kind text
);
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid,
  restaurant_id uuid,
  amount_cents int,
  is_test boolean not null default false
);
create table public.account_status_log (id bigint generated always as identity primary key, profile_id uuid);
create table public.customer_credit (id bigint generated always as identity primary key, customer_id uuid, cents int);
create table public.promo_codes (code text primary key, active boolean);
create table public.referral_codes (code text primary key, customer_id uuid);
create table public.legal_templates (id text primary key, audience text, body text);
create view public.legal_templates_current as select * from public.legal_templates;
create table public.settings (id boolean primary key default true, delivery_fee_cents int);

create or replace function public.fp_commission_rate(p_restaurant uuid, p_fulfilment text, p_at timestamptz)
returns numeric language sql stable as $$ select 20::numeric $$;

create or replace function public.my_role()
returns user_role language sql stable security definer set search_path to 'public' as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function public.assert_admin()
returns void language plpgsql stable set search_path to 'public' as $$
begin
  if coalesce(my_role()::text, '') <> 'admin' then raise exception 'admin only'; end if;
end $$;

-- rider_bonus_cents needed by order_facts
alter table public.orders add column if not exists rider_bonus_cents int;

-- order_facts mirrors the live is_test expression
create or replace view public.order_facts as
select o.id, o.created_at, o.status, o.restaurant_id, r.name as restaurant_name, o.rider_id, o.customer_id,
       o.subtotal_cents, o.delivery_fee_cents, o.commission_cents, o.service_fee_cents, o.tip_cents,
       coalesce(o.rider_bonus_cents, o.delivery_fee_cents) as rider_bonus_cents,
       o.delivered_at, o.restaurant_payout_id, o.stacked,
       o.fulfilment as fulfilment_kind,
       (o.status <> all (array['awaiting_payment'::order_status,'payment_failed'::order_status,'cancelled'::order_status])) as is_paid,
       (o.is_test or o.address like 'FP TEST%') as is_test,
       false as late_night, null::int as bid_seconds, null::timestamptz as bid_at,
       true as fast_bid, true as on_time, null::int as minutes_late,
       null::int as prep_minutes, null::numeric as actual_prep_minutes,
       null::int as eta_minutes, null::text as rider_name,
       (coalesce(o.commission_cents,0) + o.delivery_fee_cents - coalesce(o.rider_bonus_cents, o.delivery_fee_cents) + coalesce(o.service_fee_cents,0)) as company_revenue_cents
from orders o
left join restaurants r on r.id = o.restaurant_id;

-- stub 2-arg reports so the migration can drop them
create or replace function public.report_payments(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable set search_path to 'public' as $$ begin perform assert_admin(); return '{}'::jsonb; end $$;
create or replace function public.report_delivery(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable set search_path to 'public' as $$ begin perform assert_admin(); return '{}'::jsonb; end $$;
create or replace function public.report_quality(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable set search_path to 'public' as $$ begin perform assert_admin(); return '{}'::jsonb; end $$;
create or replace function public.report_safety(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable set search_path to 'public' as $$ begin perform assert_admin(); return '{}'::jsonb; end $$;

grant all on all tables in schema public to authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger on
  public.account_status_log, public.customer_credit, public.promo_codes, public.referral_codes, public.legal_templates_current
  to anon;
grant execute on all functions in schema public to authenticated, service_role;
grant select on public.settings to anon;

-- RLS (subset of live policies)
alter table profiles enable row level security;
alter table orders enable row level security;
alter table earnings enable row level security;
alter table payouts enable row level security;
alter table rider_hr enable row level security;
alter table promo_codes enable row level security;
alter table customer_credit enable row level security;
alter table settings enable row level security;

create policy "own profile read" on profiles for select to authenticated
  using (id = auth.uid() or my_role() = 'admin');
create policy "profiles update" on profiles for update to authenticated
  using (id = auth.uid() or my_role() = 'admin')
  with check ((id = auth.uid() and role = my_role()) or my_role() = 'admin');

create policy "orders visible to parties" on orders for select to authenticated
  using (customer_id = auth.uid() or restaurant_id = (select restaurant_id from profiles where id = auth.uid())
         or rider_id = auth.uid()
         or (my_role() = 'rider' and status = 'accepted')
         or my_role() = 'admin');

create policy "rider sees own earnings" on earnings for select to authenticated
  using (rider_id = auth.uid() or my_role() = 'admin');
create policy "rider sees own payouts" on payouts for select to authenticated
  using (rider_id = auth.uid() or my_role() = 'admin');
create policy "rider_hr_read" on rider_hr for select to authenticated
  using (profile_id = auth.uid() or my_role() = 'admin');
create policy "rider_hr_admin_ins" on rider_hr for insert to authenticated
  with check (my_role() = 'admin');
create policy "promo admin" on promo_codes for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy "credit own" on customer_credit for select to authenticated
  using (customer_id = auth.uid() or my_role() = 'admin');
create policy "settings readable" on settings for select to anon, authenticated using (true);

-- test identities
insert into restaurants(id, name) values
  ('00000000-0000-0000-0000-0000000000aa', 'Cafe Real'),
  ('00000000-0000-0000-0000-0000000000bb', 'Test Kitchen');

insert into profiles(id, role, full_name, email, restaurant_id, is_test) values
  ('00000000-0000-0000-0000-000000000001', 'admin', 'Ada Admin', 'ada@example.com', null, false),
  ('00000000-0000-0000-0000-000000000002', 'customer', 'Cara Customer', 'cara@example.com', null, false),
  ('00000000-0000-0000-0000-000000000003', 'rider', 'Rik Rider', 'rik@example.com', null, false),
  ('00000000-0000-0000-0000-000000000004', 'restaurant', 'Rosa Rest', 'rosa@example.com', '00000000-0000-0000-0000-0000000000aa', false),
  ('00000000-0000-0000-0000-000000000005', 'customer', 'Other Customer', 'other@example.com', null, false);

insert into rider_hr(profile_id, contract_kind) values
  ('00000000-0000-0000-0000-000000000003', 'employment');

-- one real delivered order and one test delivered order on 13 Oct 2026 CET
insert into orders(id, customer_id, restaurant_id, rider_id, status, subtotal_cents, delivery_fee_cents, service_fee_cents, commission_cents, rider_bonus_cents, address, is_test, delivered_at, created_at, paid_at)
values
  (1043, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000003',
   'delivered', 1350, 295, 0, 162, 295, 'Spoorlaan 1', false, '2026-10-13 22:42:00+02', '2026-10-13 22:40:00+02', '2026-10-13 22:41:00+02'),
  (2001, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000003',
   'delivered', 1500, 295, 99, 300, 50, 'FP TEST street', true, '2026-10-13 23:00:00+02', '2026-10-13 22:50:00+02', '2026-10-13 22:51:00+02');

insert into earnings(rider_id, order_id, amount_cents, tip_cents, earned_at) values
  ('00000000-0000-0000-0000-000000000003', 1043, 295, 0, '2026-10-13 22:42:00+02'),
  ('00000000-0000-0000-0000-000000000003', 2001, 50, 0, '2026-10-13 23:00:00+02');

insert into incidents(restaurant_id, type, severity, status, is_test, occurred_at) values
  ('00000000-0000-0000-0000-0000000000aa', 'late', 'low', 'open', false, '2026-10-13 23:10:00+02'),
  ('00000000-0000-0000-0000-0000000000bb', 'late', 'low', 'open', true, '2026-10-13 23:20:00+02');

insert into promo_codes(code, active) values ('SECRET20', true);
insert into customer_credit(customer_id, cents) values ('00000000-0000-0000-0000-000000000002', 100);
insert into settings(id, delivery_fee_cents) values (true, 295);
