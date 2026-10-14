-- v5: security hardening + feedback

-- 1) purge_test_data: SQL only (database owner)
revoke execute on function public.purge_test_data() from public, anon, authenticated;

-- 2) Customer phone numbers: not readable via the API by riders/restaurants (riders can see open orders to bid).
--    Column-level privileges: every column except phone; the customer/admin/assigned rider read it via order_phone().
revoke select on public.orders from anon, authenticated;
do $$ declare cols text; begin
  select string_agg(quote_ident(column_name), ', ') into cols from information_schema.columns
   where table_schema = 'public' and table_name = 'orders' and column_name <> 'phone';
  execute format('grant select (%s) on public.orders to authenticated', cols);
end $$;
create or replace function order_phone(p_order bigint) returns text language sql stable security definer set search_path = public as $$
  select o.phone from orders o where o.id = p_order
    and (o.customer_id = auth.uid() or o.rider_id = auth.uid() or my_role() = 'admin');
$$;
revoke execute on function public.order_phone(bigint) from public, anon;
grant execute on function public.order_phone(bigint) to authenticated;

-- 3) Inserts by users: only safe fields; everything else is set by the server.
create or replace function sanitize_order_insert() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.status := 'awaiting_payment'; new.rider_id := null; new.paid_at := null; new.payment_status := null;
    new.mollie_payment_id := null; new.refund_id := null; new.refund_status := null; new.refund_cents := null; new.refunded_at := null;
    new.accepted_at := null; new.assigned_at := null; new.ready_at := null; new.picked_up_at := null; new.delivered_at := null;
    new.cancelled_at := null; new.cancel_reason := null; new.prep_minutes := null; new.commission_cents := null;
    new.restaurant_payout_id := null; new.bid_window_closes_at := null; new.renotified_at := null; new.bid_alerted_at := null;
    new.sms_sent := '{}'; new.is_test := false; new.created_at := now();
    new.delivery_fee_cents := (select delivery_fee_cents from settings limit 1);
    if char_length(coalesce(new.address, '')) > 200 or char_length(coalesce(new.phone, '')) > 30 then
      raise exception 'address or phone too long';
    end if;
    if not exists (select 1 from restaurants where id = new.restaurant_id and active) then
      raise exception 'restaurant not available';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.sanitize_order_insert() from public, anon, authenticated;
drop trigger if exists orders_a_sanitize_insert on orders;
create trigger orders_a_sanitize_insert before insert on orders for each row execute function sanitize_order_insert();

-- Order lines: name and price always come from the menu of the order's restaurant.
create or replace function sanitize_order_item() returns trigger language plpgsql security definer set search_path = public as $$
declare m menu_items; rid uuid;
begin
  if coalesce(auth.role(), '') = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    select * into m from menu_items where id = new.menu_item_id;
    select restaurant_id into rid from orders where id = new.order_id;
    if m.id is null or m.restaurant_id is distinct from rid or not m.available then raise exception 'item not on this menu'; end if;
    if new.qty > 50 then raise exception 'quantity too large'; end if;
    new.name := m.name; new.price_cents := m.price_cents;
    -- keep the order's food subtotal consistent with the (server-priced) lines
    update orders set subtotal_cents = new.qty * new.price_cents + coalesce((select sum(qty * price_cents) from order_items where order_id = new.order_id), 0)
      where id = new.order_id;
  end if;
  return new;
end $$;
revoke execute on function public.sanitize_order_item() from public, anon, authenticated;
drop trigger if exists order_items_sanitize on order_items;
create trigger order_items_sanitize before insert on order_items for each row execute function sanitize_order_item();

-- Updates by restaurant/rider: pin identity fields and stamp milestone times on the server (no backdating).
create or replace function pin_order_fields() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.created_at := old.created_at; new.is_test := old.is_test; new.address := old.address; new.phone := old.phone;
    new.assigned_at := old.assigned_at;
    new.accepted_at := case when new.status = 'accepted' and old.status <> 'accepted' then now() else old.accepted_at end;
    new.picked_up_at := case when new.status = 'picked_up' and old.status <> 'picked_up' then now() else old.picked_up_at end;
    new.delivered_at := case when new.status = 'delivered' and old.status <> 'delivered' then now() else old.delivered_at end;
    if new.status = 'ready' and old.status <> 'ready' then new.ready_at := now(); end if;
  end if;
  return new;
end $$;
revoke execute on function public.pin_order_fields() from public, anon, authenticated;
drop trigger if exists orders_a_pin_fields on orders;
create trigger orders_a_pin_fields before update on orders for each row execute function pin_order_fields();

-- Profiles: users cannot flag themselves as test data
create or replace function guard_profile_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email or new.restaurant_id is distinct from old.restaurant_id
       or new.is_test is distinct from old.is_test or new.created_at is distinct from old.created_at then
      raise exception 'not allowed to change account status or role';
    end if;
    if char_length(coalesce(new.full_name, '')) > 80 or char_length(coalesce(new.phone, '')) > 30 then
      raise exception 'name or phone too long';
    end if;
  end if;
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end $$;

-- Only active riders see open (accepted) orders
alter policy "orders visible to parties" on orders using (
  customer_id = (select auth.uid())
  or (restaurant_id = (select my_restaurant()) and status <> all (array['awaiting_payment'::order_status, 'payment_failed'::order_status]))
  or rider_id = (select auth.uid())
  or ((select my_role()) = 'rider' and (select my_status()) = 'active' and status = 'accepted')
  or (select my_role()) = 'admin');

-- 4) Performance: evaluate auth.uid()/my_*() once per query (advisor auth_rls_initplan)
do $$ declare p record; q text; c text; begin
  for p in select * from pg_policies where schemaname = 'public' loop
    q := p.qual; c := p.with_check;
    if coalesce(q, '') !~ 'auth\.uid\(\)|my_role\(\)|my_restaurant\(\)|my_status\(\)' and coalesce(c, '') !~ 'auth\.uid\(\)|my_role\(\)|my_restaurant\(\)|my_status\(\)' then continue; end if;
    q := regexp_replace(q, '(?<!select )\m(auth\.uid|my_role|my_restaurant|my_status)\(\)', '(select \1())', 'g');
    c := regexp_replace(c, '(?<!select )\m(auth\.uid|my_role|my_restaurant|my_status)\(\)', '(select \1())', 'g');
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
  end loop;
end $$;

-- FK indexes (advisor unindexed_foreign_keys)
create index if not exists audit_events_profile_idx on audit_events(profile_id);
create index if not exists bids_rider_idx on bids(rider_id);
create index if not exists earnings_payout_idx on earnings(payout_id);
create index if not exists earnings_rider_idx on earnings(rider_id);
create index if not exists incidents_order_idx on incidents(order_id);
create index if not exists incidents_restaurant_idx on incidents(restaurant_id);
create index if not exists incidents_rider_idx on incidents(rider_id);
create index if not exists menu_items_restaurant_idx on menu_items(restaurant_id);
create index if not exists ops_alerts_order_idx on ops_alerts(order_id);
create index if not exists order_items_menu_item_idx on order_items(menu_item_id);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists orders_customer_idx on orders(customer_id);
create index if not exists orders_restaurant_idx on orders(restaurant_id);
create index if not exists orders_rider_idx on orders(rider_id);
create index if not exists orders_payout_idx on orders(restaurant_payout_id);
create index if not exists payouts_rider_idx on payouts(rider_id);
create index if not exists payouts_restaurant_idx on payouts(restaurant_id);
create index if not exists profiles_restaurant_idx on profiles(restaurant_id);
create index if not exists ratings_customer_idx on ratings(customer_id);

-- 5) Feedback from testers
create table if not exists feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references profiles(id) on delete set null,
  email text check (char_length(email) <= 200),
  page text check (char_length(page) <= 200),
  rating int check (rating between 1 and 5),
  message text not null check (char_length(message) between 3 and 4000),
  user_agent text check (char_length(user_agent) <= 400),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists feedback_user_idx on feedback(user_id);
alter table feedback enable row level security;
create policy "anyone can send feedback" on feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy "admin feedback" on feedback for select to authenticated using ((select my_role()) = 'admin');
create policy "admin resolves feedback" on feedback for update to authenticated using ((select my_role()) = 'admin') with check ((select my_role()) = 'admin');
create policy "admin deletes feedback" on feedback for delete to authenticated using ((select my_role()) = 'admin');
-- clients may not set server fields
create or replace function sanitize_feedback() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') and coalesce(my_role()::text, '') <> 'admin' then
    new.created_at := now(); new.resolved_at := null; new.is_test := false; new.user_id := auth.uid();
    -- crude flood guard: max 20 feedback rows per minute overall
    if (select count(*) from feedback where created_at > now() - interval '1 minute') >= 20 then raise exception 'too many feedback messages, try again in a minute'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.sanitize_feedback() from public, anon, authenticated;
drop trigger if exists feedback_sanitize on feedback;
create trigger feedback_sanitize before insert on feedback for each row execute function sanitize_feedback();
grant insert (email, page, rating, message, user_agent) on feedback to anon, authenticated;
grant select, update, delete on feedback to authenticated;

-- Fix: the profile update check queried profiles itself (infinite recursion); my_role() is a security definer helper.
alter policy "own profile update" on profiles using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = (select my_role()));
