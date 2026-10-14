-- v12 security/performance audit.
-- 1) Least privilege for anon: RLS already blocks writes, but drop the default table grants so a policy mistake
--    can't expose data. Anonymous visitors only browse restaurants/menus/settings and can send feedback.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    if t not in ('restaurants', 'menu_items', 'settings') then execute format('revoke select on public.%I from anon', t); end if;
  end loop;
end $$;
grant insert on public.feedback to anon;

-- 2) One permissive policy per table/command (advisor "multiple_permissive_policies"); same access as before.
-- bids
drop policy if exists "admin bids" on bids; drop policy if exists "riders bid" on bids;
create policy "bids insert" on bids for insert to authenticated with check (
  ((rider_id = (select auth.uid())) and ((select my_role()) = 'rider') and ((select my_status()) = 'active') and (accepted = false)
   and exists (select 1 from orders o where o.id = bids.order_id and o.status = 'accepted' and o.rider_id is null
               and (o.bid_window_closes_at is null or o.bid_window_closes_at > now()))
   and fp_may_bid(order_id))
  or ((select my_role()) = 'admin'));
create policy "bids admin update" on bids for update to authenticated using ((select my_role()) = 'admin') with check ((select my_role()) = 'admin');
create policy "bids admin delete" on bids for delete to authenticated using ((select my_role()) = 'admin');
-- earnings / payouts: SELECT policy already includes admin
drop policy if exists "admin earnings" on earnings;
create policy "earnings admin insert" on earnings for insert to authenticated with check ((select my_role()) = 'admin');
create policy "earnings admin update" on earnings for update to authenticated using ((select my_role()) = 'admin');
create policy "earnings admin delete" on earnings for delete to authenticated using ((select my_role()) = 'admin');
drop policy if exists "admin payouts" on payouts;
create policy "payouts admin insert" on payouts for insert to authenticated with check ((select my_role()) = 'admin');
create policy "payouts admin update" on payouts for update to authenticated using ((select my_role()) = 'admin');
create policy "payouts admin delete" on payouts for delete to authenticated using ((select my_role()) = 'admin');
-- menu_items: public read stays; management split by command
drop policy if exists "restaurant manages menu" on menu_items;
create policy "menu insert" on menu_items for insert to authenticated with check ((restaurant_id = (select my_restaurant())) or ((select my_role()) = 'admin'));
create policy "menu update" on menu_items for update to authenticated using ((restaurant_id = (select my_restaurant())) or ((select my_role()) = 'admin')) with check ((restaurant_id = (select my_restaurant())) or ((select my_role()) = 'admin'));
create policy "menu delete" on menu_items for delete to authenticated using ((restaurant_id = (select my_restaurant())) or ((select my_role()) = 'admin'));
-- orders
drop policy if exists "admin orders" on orders; drop policy if exists "customer creates order" on orders;
drop policy if exists "restaurant updates own orders" on orders; drop policy if exists "rider updates assigned orders" on orders;
create policy "orders insert" on orders for insert to authenticated with check (
  ((customer_id = (select auth.uid())) and (status = 'awaiting_payment') and (coalesce((select my_status()), 'active') = 'active'))
  or ((select my_role()) = 'admin'));
create policy "orders update" on orders for update to authenticated using (
  ((restaurant_id = (select my_restaurant())) and status <> all (array['awaiting_payment', 'payment_failed']::order_status[]))
  or (rider_id = (select auth.uid()))
  or ((select my_role()) = 'admin'));
create policy "orders admin delete" on orders for delete to authenticated using ((select my_role()) = 'admin');
-- profiles
drop policy if exists "admin profiles" on profiles; drop policy if exists "own profile update" on profiles;
create policy "profiles update" on profiles for update to authenticated
  using ((id = (select auth.uid())) or ((select my_role()) = 'admin'))
  with check (((id = (select auth.uid())) and (role = (select my_role()))) or ((select my_role()) = 'admin'));
create policy "profiles admin insert" on profiles for insert to authenticated with check ((select my_role()) = 'admin');
create policy "profiles admin delete" on profiles for delete to authenticated using ((select my_role()) = 'admin');
-- restaurants
drop policy if exists "admin restaurants" on restaurants; drop policy if exists "public restaurants" on restaurants;
create policy "restaurants anon read" on restaurants for select to anon using (active);
create policy "restaurants read" on restaurants for select to authenticated using (active or ((select my_role()) = 'admin'));
create policy "restaurants admin insert" on restaurants for insert to authenticated with check ((select my_role()) = 'admin');
create policy "restaurants admin update" on restaurants for update to authenticated using ((select my_role()) = 'admin');
create policy "restaurants admin delete" on restaurants for delete to authenticated using ((select my_role()) = 'admin');

-- 3) Generic rate limiter for sensitive RPCs (per user + action, sliding window).
create table if not exists public.rate_limits (
  profile_id uuid not null, action text not null, at timestamptz not null default now()
);
create index if not exists rate_limits_lookup on public.rate_limits(profile_id, action, at desc);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
create or replace function public.fp_rate_limit(p_action text, p_max int, p_window interval) returns void
language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  if auth.uid() is null then return; end if;
  if coalesce(my_role()::text, '') = 'admin' then return; end if;
  select count(*) into n from rate_limits where profile_id = auth.uid() and action = p_action and at > now() - p_window;
  if n >= p_max then raise exception 'Te veel verzoeken, probeer het over een paar minuten opnieuw (rate limit)' using errcode = 'P0429'; end if;
  insert into rate_limits(profile_id, action) values (auth.uid(), p_action);
end $$;
revoke all on function public.fp_rate_limit(text, int, interval) from public, anon, authenticated;
select cron.unschedule('fp-purge-rate-limits') where exists (select 1 from cron.job where jobname = 'fp-purge-rate-limits');
select cron.schedule('fp-purge-rate-limits', '*/30 * * * *', $$delete from public.rate_limits where at < now() - interval '1 day'$$);
