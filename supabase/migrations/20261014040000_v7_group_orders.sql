-- v7: group orders. A host opens a group at one restaurant and shares a code/link;
-- signed-in guests join and add their own items; the host locks, sets a deadline,
-- removes items and checks out (pays for everything through the existing create-payment flow).
-- All writes go through SECURITY DEFINER RPCs; tables are read-only (members only) for clients.

create table if not exists group_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id uuid not null references profiles on delete cascade,
  restaurant_id uuid not null references restaurants on delete cascade,
  status text not null default 'open' check (status in ('open','locked','checked_out','cancelled')),
  deadline timestamptz,
  order_id bigint references orders on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists group_members (
  group_id uuid not null references group_orders on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table if not exists group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references group_orders on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  menu_item_id uuid not null references menu_items on delete cascade,
  name text not null,
  qty int not null check (qty between 1 and 20),
  price_cents int not null check (price_cents >= 0),
  added_at timestamptz not null default now()
);
create index if not exists group_orders_host_idx on group_orders(host_id);
create index if not exists group_orders_restaurant_idx on group_orders(restaurant_id);
create index if not exists group_orders_order_idx on group_orders(order_id);
create index if not exists group_members_user_idx on group_members(user_id);
create index if not exists group_items_group_idx on group_items(group_id);
create index if not exists group_items_user_idx on group_items(user_id);
create index if not exists group_items_menu_idx on group_items(menu_item_id);

-- Link back from the order (for the split view on the tracking page) and label lines per person.
alter table orders add column if not exists group_order_id uuid references group_orders on delete set null;
create index if not exists orders_group_order_idx on orders(group_order_id);
alter table order_items add column if not exists guest_name text;
-- orders uses column-level SELECT grants (phone excluded): new columns need an explicit grant
grant select (group_order_id) on public.orders to authenticated;

-- Helper: am I a member of this group? (definer so policies don't recurse)
create or replace function is_group_member(p_group uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = auth.uid());
$$;
revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

alter table group_orders enable row level security;
alter table group_members enable row level security;
alter table group_items enable row level security;
revoke all on group_orders, group_members, group_items from public, anon, authenticated;
grant select on group_orders, group_members, group_items to authenticated;

drop policy if exists "group visible to members" on group_orders;
create policy "group visible to members" on group_orders for select to authenticated
  using ((select is_group_member(id)) or (select my_role()) = 'admin');
drop policy if exists "members visible to members" on group_members;
create policy "members visible to members" on group_members for select to authenticated
  using ((select is_group_member(group_id)) or (select my_role()) = 'admin');
drop policy if exists "items visible to members" on group_items;
create policy "items visible to members" on group_items for select to authenticated
  using ((select is_group_member(group_id)) or (select my_role()) = 'admin');

-- internal: lock + deadline check
create or replace function fp_group_editable(g group_orders) returns void language plpgsql stable set search_path = public as $$
begin
  if g.id is null then raise exception 'group not found'; end if;
  if g.status <> 'open' then raise exception 'this group order is locked'; end if;
  if g.deadline is not null and now() > g.deadline then raise exception 'the deadline for this group order has passed'; end if;
end $$;
revoke execute on function public.fp_group_editable(group_orders) from public, anon, authenticated;

create or replace function fp_member_name(p_name text) returns text language sql stable security definer set search_path = public as $$
  select left(coalesce(nullif(btrim(regexp_replace(p_name, '[<>\r\n\t]', '', 'g')), ''),
    nullif(split_part(btrim((select full_name from profiles where id = auth.uid())), ' ', 1), ''), 'Gast'), 40);
$$;
revoke execute on function public.fp_member_name(text) from public, anon, authenticated;

create or replace function create_group_order(p_restaurant uuid, p_name text default null, p_deadline_minutes int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c text; gid uuid; n int;
begin
  if uid is null then raise exception 'please sign in first'; end if;
  if not exists (select 1 from restaurants where id = p_restaurant and active) then raise exception 'restaurant not available'; end if;
  select count(*) into n from group_orders where host_id = uid and status = 'open' and created_at > now() - interval '1 day';
  if n >= 5 then raise exception 'you already have 5 open group orders'; end if;
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from group_orders where code = c);
  end loop;
  insert into group_orders (code, host_id, restaurant_id, deadline)
    values (c, uid, p_restaurant, case when p_deadline_minutes between 5 and 240 then now() + make_interval(mins => p_deadline_minutes) end)
    returning id into gid;
  insert into group_members (group_id, user_id, display_name) values (gid, uid, fp_member_name(p_name));
  return jsonb_build_object('id', gid, 'code', c);
end $$;

-- Preview before joining (non-members can't read the tables): only non-sensitive fields.
create or replace function group_preview(p_code text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', g.id, 'status', g.status, 'deadline', g.deadline, 'restaurant_id', g.restaurant_id,
    'restaurant_name', r.name, 'host_name', (select display_name from group_members where group_id = g.id and user_id = g.host_id),
    'members', (select count(*) from group_members where group_id = g.id))
  from group_orders g join restaurants r on r.id = g.restaurant_id
  where auth.uid() is not null and g.code = upper(btrim(p_code));
$$;

create or replace function join_group_order(p_code text, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare g group_orders; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'please sign in first'; end if;
  select * into g from group_orders where code = upper(btrim(p_code));
  if g.id is null then raise exception 'group order not found'; end if;
  if exists (select 1 from group_members where group_id = g.id and user_id = uid) then
    if p_name is not null then update group_members set display_name = fp_member_name(p_name) where group_id = g.id and user_id = uid; end if;
    return g.id;
  end if;
  perform fp_group_editable(g);
  if (select count(*) from group_members where group_id = g.id) >= 25 then raise exception 'this group is full (25 people)'; end if;
  insert into group_members (group_id, user_id, display_name) values (g.id, uid, fp_member_name(p_name));
  update group_orders set updated_at = now() where id = g.id;
  return g.id;
end $$;

-- Add (or increase) my own item. Name and price always come from the menu.
create or replace function group_add_item(p_group uuid, p_menu_item uuid, p_qty int default 1) returns uuid
language plpgsql security definer set search_path = public as $$
declare g group_orders; m menu_items; uid uuid := auth.uid(); iid uuid;
begin
  select * into g from group_orders where id = p_group;
  if g.id is null or not is_group_member(p_group) then raise exception 'group not found'; end if;
  perform fp_group_editable(g);
  if p_qty is null or p_qty < 1 or p_qty > 20 then raise exception 'invalid quantity'; end if;
  select * into m from menu_items where id = p_menu_item;
  if m.id is null or m.restaurant_id <> g.restaurant_id or not m.available then raise exception 'item not on this menu'; end if;
  if (select count(*) from group_items where group_id = p_group) >= 100 then raise exception 'basket is full'; end if;
  select id into iid from group_items where group_id = p_group and user_id = uid and menu_item_id = m.id;
  if iid is not null then
    update group_items set qty = least(20, qty + p_qty), name = m.name, price_cents = m.price_cents where id = iid;
  else
    insert into group_items (group_id, user_id, menu_item_id, name, qty, price_cents)
      values (p_group, uid, m.id, m.name, p_qty, m.price_cents) returning id into iid;
  end if;
  update group_orders set updated_at = now() where id = p_group;
  return iid;
end $$;

-- Change quantity of an item: only its owner (0 = remove).
create or replace function group_set_qty(p_item uuid, p_qty int) returns void language plpgsql security definer set search_path = public as $$
declare it group_items; g group_orders;
begin
  select * into it from group_items where id = p_item;
  if it.id is null or it.user_id <> auth.uid() then raise exception 'item not found'; end if;
  select * into g from group_orders where id = it.group_id;
  perform fp_group_editable(g);
  if p_qty is null or p_qty < 0 or p_qty > 20 then raise exception 'invalid quantity'; end if;
  if p_qty = 0 then delete from group_items where id = p_item; else update group_items set qty = p_qty where id = p_item; end if;
  update group_orders set updated_at = now() where id = g.id;
end $$;

-- Remove an item: its owner (while open) or the host (until checkout).
create or replace function group_remove_item(p_item uuid) returns void language plpgsql security definer set search_path = public as $$
declare it group_items; g group_orders;
begin
  select * into it from group_items where id = p_item;
  if it.id is null then raise exception 'item not found'; end if;
  select * into g from group_orders where id = it.group_id;
  if g.host_id = auth.uid() then
    if g.status not in ('open','locked') then raise exception 'this group order is already checked out'; end if;
  elsif it.user_id = auth.uid() then
    perform fp_group_editable(g);
  else raise exception 'item not found';
  end if;
  delete from group_items where id = p_item;
  update group_orders set updated_at = now() where id = g.id;
end $$;

-- Host only: lock/unlock, deadline, cancel.
create or replace function group_set_locked(p_group uuid, p_locked boolean) returns void language plpgsql security definer set search_path = public as $$
declare g group_orders;
begin
  select * into g from group_orders where id = p_group;
  if g.id is null or g.host_id <> auth.uid() then raise exception 'only the host can do this'; end if;
  if g.status not in ('open','locked') then raise exception 'this group order is already checked out'; end if;
  update group_orders set status = case when p_locked then 'locked' else 'open' end,
    deadline = case when not p_locked and deadline < now() then null else deadline end, updated_at = now() where id = p_group;
end $$;

create or replace function group_set_deadline(p_group uuid, p_minutes int) returns void language plpgsql security definer set search_path = public as $$
declare g group_orders;
begin
  select * into g from group_orders where id = p_group;
  if g.id is null or g.host_id <> auth.uid() then raise exception 'only the host can do this'; end if;
  if g.status <> 'open' then raise exception 'unlock the basket first'; end if;
  if p_minutes is not null and (p_minutes < 5 or p_minutes > 240) then raise exception 'deadline must be 5 to 240 minutes'; end if;
  update group_orders set deadline = case when p_minutes is null then null else now() + make_interval(mins => p_minutes) end, updated_at = now() where id = p_group;
end $$;

create or replace function group_cancel(p_group uuid) returns void language plpgsql security definer set search_path = public as $$
declare g group_orders;
begin
  select * into g from group_orders where id = p_group;
  if g.id is null or g.host_id <> auth.uid() then raise exception 'only the host can do this'; end if;
  if g.status not in ('open','locked') then raise exception 'this group order is already checked out'; end if;
  update group_orders set status = 'cancelled', updated_at = now() where id = p_group;
end $$;

-- Guests can leave while open (their items go with them).
create or replace function group_leave(p_group uuid) returns void language plpgsql security definer set search_path = public as $$
declare g group_orders;
begin
  select * into g from group_orders where id = p_group;
  if g.id is null or not is_group_member(p_group) then raise exception 'group not found'; end if;
  if g.host_id = auth.uid() then raise exception 'the host cannot leave; cancel the group instead'; end if;
  if g.status <> 'open' then raise exception 'this group order is locked'; end if;
  delete from group_items where group_id = p_group and user_id = auth.uid();
  delete from group_members where group_id = p_group and user_id = auth.uid();
end $$;

-- Host only: turn the basket into ONE normal order (host = customer, one address, one rider).
-- Prices are re-read from the menu; payment then goes through create-payment (which recomputes again).
create or replace function group_checkout(p_group uuid, p_address text, p_phone text) returns bigint
language plpgsql security definer set search_path = public as $$
declare g group_orders; oid bigint; sub int; fee int;
begin
  select * into g from group_orders where id = p_group for update;
  if g.id is null or g.host_id <> auth.uid() then raise exception 'only the host can do this'; end if;
  if g.status = 'checked_out' and g.order_id is not null then return g.order_id; end if;  -- idempotent (retry payment)
  if g.status not in ('open','locked') then raise exception 'this group order was cancelled'; end if;
  if char_length(coalesce(p_address, '')) not between 4 and 200 or char_length(coalesce(p_phone, '')) > 30
     or length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 9 then raise exception 'address or phone invalid'; end if;
  if not exists (select 1 from restaurants where id = g.restaurant_id and active) then raise exception 'restaurant not available'; end if;
  if exists (select 1 from group_items gi join menu_items m on m.id = gi.menu_item_id where gi.group_id = p_group and not m.available)
    then raise exception 'an item is no longer available'; end if;
  select coalesce(sum(gi.qty * m.price_cents), 0) into sub from group_items gi join menu_items m on m.id = gi.menu_item_id where gi.group_id = p_group;
  if sub = 0 then raise exception 'the basket is empty'; end if;
  fee := (select delivery_fee_cents from settings limit 1);
  insert into orders (customer_id, restaurant_id, status, subtotal_cents, delivery_fee_cents, address, phone, is_test, group_order_id)
    values (g.host_id, g.restaurant_id, 'awaiting_payment', sub, fee, btrim(p_address), btrim(p_phone),
            coalesce((select is_test from profiles where id = g.host_id), false), g.id)
    returning id into oid;
  -- one line per person+item so the restaurant can label bags
  insert into order_items (order_id, menu_item_id, name, qty, price_cents, guest_name)
    select oid, m.id, m.name, gi.qty, m.price_cents, gm.display_name
    from group_items gi join menu_items m on m.id = gi.menu_item_id
    join group_members gm on gm.group_id = gi.group_id and gm.user_id = gi.user_id
    where gi.group_id = p_group order by gm.joined_at, gi.added_at;
  update orders set subtotal_cents = sub where id = oid;  -- order_items trigger may have re-summed; keep exact
  update group_orders set status = 'checked_out', order_id = oid, updated_at = now() where id = p_group;
  return oid;
end $$;

-- Lock down: no anon access to any RPC; authenticated only.
do $$ declare f text; begin
  foreach f in array array['create_group_order(uuid,text,integer)','group_preview(text)','join_group_order(text,text)',
    'group_add_item(uuid,uuid,integer)','group_set_qty(uuid,integer)','group_remove_item(uuid)','group_set_locked(uuid,boolean)',
    'group_set_deadline(uuid,integer)','group_cancel(uuid)','group_leave(uuid)','group_checkout(uuid,text,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Realtime basket. postgres_changes applies the select policies to INSERT/UPDATE, but NOT to DELETE,
-- so keep the default replica identity (DELETE payloads then carry only the row id, no contents).
-- Every change bumps group_orders.updated_at, so clients listen to that RLS-filtered UPDATE and refetch.
alter table group_orders replica identity default;
alter table group_items replica identity default;
alter table group_members replica identity default;
do $$ begin
  alter publication supabase_realtime add table group_orders, group_members, group_items;
exception when duplicate_object then null; end $$;
