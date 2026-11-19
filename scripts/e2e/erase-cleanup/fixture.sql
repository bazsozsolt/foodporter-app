-- Local stand-in for the tables the v36 cleanup touches. Not applied anywhere but a throwaway database.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('fp.test_uid', true), '')::uuid
$$;

create or replace function public.assert_admin() returns void
language plpgsql stable as $$
begin
  if current_setting('fp.test_admin', true) is distinct from 'on' then
    raise exception 'admin only';
  end if;
end $$;

create schema if not exists storage;
create table if not exists storage.objects (
  id uuid primary key,
  bucket_id text,
  name text,
  owner uuid,
  owner_id text,
  user_metadata jsonb
);

create table public.profiles (
  id uuid primary key,
  role text not null default 'customer',
  full_name text,
  phone text,
  email text,
  iban text,
  status text not null default 'active',
  is_test boolean not null default false
);

create table public.orders (
  id bigint primary key,
  customer_id uuid not null references public.profiles(id),
  rider_id uuid references public.profiles(id),
  restaurant_id uuid not null,
  status text not null,
  address text not null,
  phone text not null,
  subtotal_cents int not null,
  delivery_fee_cents int not null,
  commission_cents int,
  commission_pct numeric,
  fulfilment text not null default 'delivery',
  rider_bonus_cents int,
  paid_at timestamptz,
  mollie_payment_id text,
  lat double precision,
  lng double precision,
  cancel_reason text,
  referral_code text,
  delivery_photo_path text,
  delivery_photo_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  name text not null,
  guest_name text
);

create table public.order_messages (
  id bigserial primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_role text not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.earnings (
  id uuid primary key,
  rider_id uuid not null references public.profiles(id),
  order_id bigint not null unique references public.orders(id),
  amount_cents int not null
);

create table public.payouts (
  id uuid primary key,
  rider_id uuid references public.profiles(id),
  restaurant_id uuid,
  amount_cents int not null,
  reference text,
  constraint payouts_one_party check ((rider_id is null) <> (restaurant_id is null))
);

create table public.customer_credit (
  id bigserial primary key,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  cents int not null,
  reason text not null,
  order_id bigint,
  constraint customer_credit_reason_check check (reason in ('referral_new', 'referral_friend', 'used', 'admin', 'refund'))
);

create table public.settings (
  id boolean primary key default true check (id),
  rider_bonus_cents int not null default 50
);
insert into public.settings (id) values (true);

create or replace function public.fp_commission_rate(p_restaurant uuid, p_fulfilment text, p_at timestamptz)
returns numeric language sql stable as $$ select 12::numeric $$;

create table public.bids (
  id uuid primary key,
  order_id bigint not null references public.orders(id) on delete cascade,
  rider_id uuid not null references public.profiles(id),
  rider_name text,
  unique (order_id, rider_id)
);

create table public.ratings (
  order_id bigint primary key references public.orders(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  comment text
);

create table public.promo_codes (
  code text primary key,
  created_by uuid references public.profiles(id)
);

create table public.support_tickets (
  id bigserial primary key,
  created_by uuid not null references public.profiles(id) on delete cascade,
  assigned_to uuid references public.profiles(id) on delete set null,
  category text not null,
  status text not null default 'open',
  subject text not null check (char_length(subject) between 1 and 140),
  lat double precision,
  lng double precision,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.support_messages (
  id bigserial primary key,
  ticket_id bigint not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  photo_path text
);

create table public.account_status_log (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);

create table public.feedback (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  email text,
  message text not null,
  user_agent text
);

create table public.incidents (
  id bigserial primary key,
  rider_id uuid references public.profiles(id) on delete set null,
  created_by uuid,
  description text
);

create table public.call_audit (
  id bigserial primary key,
  order_id bigint not null,
  caller_id uuid references public.profiles(id) on delete set null,
  caller_role text not null
);

create table public.ops_alerts (
  id bigserial primary key,
  message text not null
);

create table public.legal_acceptances (
  id bigserial primary key,
  template_id text not null,
  profile_id uuid not null,
  ip inet,
  user_agent text
);

create table public.legal_requests (
  id bigserial primary key,
  profile_id uuid references public.profiles(id) on delete cascade,
  restaurant_id uuid,
  sent_by uuid,
  check ((profile_id is null) <> (restaurant_id is null))
);

create table public.audit_events (
  id bigserial primary key,
  order_id bigint,
  profile_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  from_value text,
  to_value text,
  actor uuid
);

create table public.push_subscriptions (
  id uuid primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null
);

create table public.referral_codes (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null
);

create table public.rate_limits (
  id bigserial primary key,
  profile_id uuid not null,
  action text not null
);

create table public.rider_locations (
  id bigserial primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade
);

create table public.rider_availability (
  id bigserial primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade
);

create table public.rider_hr (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  birthdate date
);

create table public.rider_documents (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  verified_by uuid,
  primary key (profile_id, kind)
);

create table public.rider_onboarding (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  step text not null,
  done_by uuid,
  primary key (profile_id, step)
);

create table public.rider_shifts (
  id bigserial primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid
);

create table public.work_sessions (
  id bigserial primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade
);

create table public.work_violations (
  id bigserial primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade
);

create table public.group_orders (
  id uuid primary key,
  host_id uuid not null references public.profiles(id) on delete cascade,
  restaurant_id uuid not null
);

create table public.group_members (
  group_id uuid not null references public.group_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  primary key (group_id, user_id)
);

create table public.group_items (
  id uuid primary key,
  group_id uuid not null references public.group_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade
);

-- These guards exist on the live database. The cleanup has to get past them.
create or replace function public.pin_order_fields() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' then
    new.address := old.address;
    new.phone := old.phone;
  end if;
  return new;
end $$;
drop trigger if exists orders_a_pin_fields on public.orders;
create trigger orders_a_pin_fields before update on public.orders
  for each row execute function public.pin_order_fields();

create or replace function public.fp_guard_proof() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('fp.proof', true), '') <> 'on'
     and (new.delivery_photo_path is distinct from old.delivery_photo_path
          or new.delivery_photo_at is distinct from old.delivery_photo_at) then
    raise exception 'delivery photo can only be set by the rider at drop-off';
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_proof on public.orders;
create trigger orders_guard_proof before update on public.orders
  for each row execute function public.fp_guard_proof();

-- Placeholder. The migration replaces this with the real calculator plus the fp.erasure skip.
create or replace function public.fp_order_commission() returns trigger
language plpgsql set search_path = public as $$
begin
  new.commission_cents := 1;
  return new;
end $$;
drop trigger if exists orders_zz_commission on public.orders;
create trigger orders_zz_commission before update on public.orders
  for each row execute function public.fp_order_commission();
