-- Food Porter pilot schema (Supabase / Postgres)
create extension if not exists "pgcrypto";

create type user_role as enum ('customer', 'rider', 'restaurant', 'admin');
create type order_status as enum ('placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled');

-- Profiles: one per auth user
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'customer',
  full_name text,
  phone text,
  restaurant_id uuid,               -- set for restaurant staff
  iban text,                        -- riders: for weekly manual payouts
  created_at timestamptz not null default now()
);

create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cuisine text,
  area text,
  address text,
  avg_prep_minutes int not null default 15,
  commission_pct numeric(4,2) not null default 12 check (commission_pct between 10 and 15),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table profiles add constraint profiles_restaurant_fk foreign key (restaurant_id) references restaurants(id);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants on delete cascade,
  name text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  available boolean not null default true
);

create table orders (
  id bigint generated always as identity primary key,
  customer_id uuid not null references profiles,
  restaurant_id uuid not null references restaurants,
  rider_id uuid references profiles,
  status order_status not null default 'placed',
  subtotal_cents int not null,
  delivery_fee_cents int not null check (delivery_fee_cents between 250 and 350),
  commission_cents int,
  address text not null,
  phone text not null,
  prep_minutes int,
  ready_at timestamptz,
  mollie_payment_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references orders on delete cascade,
  menu_item_id uuid references menu_items,
  name text not null,
  qty int not null check (qty > 0),
  price_cents int not null
);

create table bids (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references orders on delete cascade,
  rider_id uuid not null references profiles,
  eta_minutes int not null check (eta_minutes between 5 and 90),
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, rider_id)
);
create unique index one_accepted_bid_per_order on bids(order_id) where accepted;

create table payouts (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles,
  week_start date not null,
  amount_cents int not null,
  paid_at timestamptz,
  reference text,
  unique (rider_id, week_start)
);

create table earnings (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references profiles,
  order_id bigint not null unique references orders,
  amount_cents int not null,          -- rider keeps 100% of delivery fee
  earned_at timestamptz not null default now(),
  payout_id uuid references payouts
);

-- Helpers
create or replace function my_role() returns user_role language sql stable security definer set search_path = public as
  $$ select role from profiles where id = auth.uid() $$;
create or replace function my_restaurant() returns uuid language sql stable security definer set search_path = public as
  $$ select restaurant_id from profiles where id = auth.uid() $$;

-- Auto-create profile on signup
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Accepting a bid: assigns rider atomically (call via rpc)
create or replace function accept_bid(p_bid uuid) returns void language plpgsql security definer set search_path = public as $$
declare b bids;
begin
  select * into b from bids where id = p_bid for update;
  if not found then raise exception 'bid not found'; end if;
  if my_role() <> 'admin' and not exists (select 1 from orders where id = b.order_id and status = 'accepted') then
    raise exception 'order not open for bids';
  end if;
  update bids set accepted = true where id = p_bid;
  update orders set rider_id = b.rider_id, status = 'assigned', assigned_at = now() where id = b.order_id;
end $$;

-- Key metric view: accepted bid within 3 min AND delivered within bid ETA
create view order_metrics as
select o.id, o.created_at,
  (b.created_at - o.accepted_at) <= interval '3 minutes' as fast_bid,
  (o.delivered_at <= b.created_at + make_interval(mins => b.eta_minutes)) as on_time
from orders o left join bids b on b.order_id = o.id and b.accepted;

-- RLS
alter table profiles enable row level security;
alter table restaurants enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table bids enable row level security;
alter table earnings enable row level security;
alter table payouts enable row level security;

create policy "own profile read" on profiles for select using (id = auth.uid() or my_role() = 'admin');
create policy "own profile update" on profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));  -- cannot self-promote
create policy "admin profiles" on profiles for all using (my_role() = 'admin');

create policy "public restaurants" on restaurants for select using (active or my_role() = 'admin');
create policy "admin restaurants" on restaurants for all using (my_role() = 'admin');

create policy "public menu" on menu_items for select using (true);
create policy "restaurant manages menu" on menu_items for all
  using (restaurant_id = my_restaurant() or my_role() = 'admin')
  with check (restaurant_id = my_restaurant() or my_role() = 'admin');

create policy "orders visible to parties" on orders for select using (
  customer_id = auth.uid()
  or restaurant_id = my_restaurant()
  or rider_id = auth.uid()
  or (my_role() = 'rider' and status = 'accepted')   -- open feed
  or my_role() = 'admin');
create policy "customer creates order" on orders for insert with check (customer_id = auth.uid() and status = 'placed');
create policy "restaurant updates own orders" on orders for update using (restaurant_id = my_restaurant());
create policy "rider updates assigned orders" on orders for update using (rider_id = auth.uid());
create policy "admin orders" on orders for all using (my_role() = 'admin');
-- NOTE: payment status & commission should be set by server code (service role) from Mollie webhooks.

create policy "order items visible with order" on order_items for select using (exists (select 1 from orders o where o.id = order_id));
create policy "customer adds items" on order_items for insert with check (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'placed'));

create policy "riders bid" on bids for insert with check (rider_id = auth.uid() and my_role() = 'rider' and accepted = false);
create policy "bids visible" on bids for select using (
  rider_id = auth.uid() or my_role() = 'admin'
  or exists (select 1 from orders o where o.id = order_id and (o.customer_id = auth.uid() or o.restaurant_id = my_restaurant())));

create policy "rider sees own earnings" on earnings for select using (rider_id = auth.uid() or my_role() = 'admin');
create policy "admin earnings" on earnings for all using (my_role() = 'admin');
create policy "rider sees own payouts" on payouts for select using (rider_id = auth.uid() or my_role() = 'admin');
create policy "admin payouts" on payouts for all using (my_role() = 'admin');

-- Realtime for live bids & status
alter publication supabase_realtime add table orders, bids;
