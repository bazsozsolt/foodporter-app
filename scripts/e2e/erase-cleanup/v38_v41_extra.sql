-- Extra objects so v38–v41 migrations can be applied on the erase-cleanup
-- fixture, standing in for the live (v41) schema. Local only. No live apply.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'awaiting_payment', 'payment_failed', 'placed', 'accepted', 'assigned',
      'ready', 'picked_up', 'delivered', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('customer', 'rider', 'restaurant', 'admin');
  end if;
end $$;

alter table public.orders
  add column if not exists discount_cents int not null default 0,
  add column if not exists credit_cents int not null default 0,
  add column if not exists service_fee_cents int not null default 0,
  add column if not exists tip_cents int not null default 0,
  add column if not exists is_test boolean not null default false,
  add column if not exists stacked boolean not null default false,
  add column if not exists prep_minutes int,
  add column if not exists ready_at timestamptz,
  add column if not exists assigned_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists renotified_at timestamptz,
  add column if not exists bid_window_closes_at timestamptz,
  add column if not exists distance_km numeric;

alter table public.profiles
  add column if not exists restaurant_id uuid,
  add column if not exists created_at timestamptz not null default now();

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
  add column if not exists min_delivery_order_cents int not null default 1500,
  add column if not exists stale_assignment_minutes int not null default 180,
  add column if not exists commission_delivery_pct numeric,
  add column if not exists commission_intro_pct numeric,
  add column if not exists commission_intro_months int,
  add column if not exists commission_pickup_pct numeric,
  add column if not exists payroll_provider text,
  add column if not exists wml_cents int,
  add column if not exists cao text,
  add column if not exists cao_scale_cents int,
  add column if not exists atw_break_after_h numeric,
  add column if not exists call_notice_days int,
  add column if not exists delivery_fee_cents int;

create table if not exists public.restaurants (
  id uuid primary key,
  name text,
  commission_pct numeric,
  partner_since date,
  created_at date default current_date,
  active boolean default true,
  min_order_cents int
);

create table if not exists public.legal_templates_current (
  template_id text primary key,
  version numeric
);

-- Helpers referenced by v39–v41 policies and functions.
-- Live profiles.role is user_role; v41 policies compare my_role() to 'admin'::user_role.
alter table public.profiles
  alter column role drop default,
  alter column role type public.user_role using role::public.user_role,
  alter column role set default 'customer'::public.user_role;

create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer
set search_path to 'public'
as $$
  select role from public.profiles where id = auth.uid()
$$;

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

revoke all on function public.my_role() from public, anon;
revoke all on function public.my_status() from public, anon;
revoke all on function public.my_restaurant() from public, anon;
revoke all on function public.fp_stack_reason(uuid, bigint) from public, anon;
revoke all on function public.fp_may_bid(bigint) from public, anon;
grant execute on function public.my_role() to authenticated, service_role;
grant execute on function public.my_status() to authenticated, service_role;
grant execute on function public.my_restaurant() to authenticated, service_role;
grant execute on function public.fp_stack_reason(uuid, bigint) to authenticated, service_role;
grant execute on function public.fp_may_bid(bigint) to authenticated, service_role;


-- v39's stale-assignment helpers take order_status; the live column is the enum.
alter table public.orders
  alter column status drop default,
  alter column status type public.order_status using status::public.order_status;

alter table public.orders enable row level security;
alter table public.settings enable row level security;

alter table public.bids
  add column if not exists accepted boolean not null default false,
  add column if not exists eta_minutes int;
alter table public.bids enable row level security;
create extension if not exists dblink;

-- Live trigger (v26/v36) is BEFORE INSERT OR UPDATE; the slim fixture only attached UPDATE.
drop trigger if exists orders_zz_commission on public.orders;
create trigger orders_zz_commission before insert or update on public.orders
  for each row execute function public.fp_order_commission();

