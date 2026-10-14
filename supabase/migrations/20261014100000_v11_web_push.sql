-- Web push. Subscriptions are written only through RPCs for the signed-in user; the VAPID key pair is generated
-- inside the order-push edge function and stored in a table no client role can read (the private key never
-- leaves the server). push_log dedupes events so repeated or spoofed calls can't send extra pushes.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  user_agent text check (char_length(user_agent) < 300),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  fail_count int not null default 0
);
create index if not exists push_subscriptions_profile on public.push_subscriptions(profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, endpoint, created_at, last_ok_at) on public.push_subscriptions to authenticated;
drop policy if exists push_own_select on public.push_subscriptions;
create policy push_own_select on public.push_subscriptions for select to authenticated using (profile_id = (select auth.uid()));

create table if not exists public.push_vapid (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
alter table public.push_vapid enable row level security;
revoke all on public.push_vapid from anon, authenticated;

create table if not exists public.push_log (
  event_key text primary key,
  order_id bigint,
  recipients int not null default 0,
  sent int not null default 0,
  pruned int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;
revoke all on public.push_log from anon, authenticated;
create index if not exists push_log_order on public.push_log(order_id);

create or replace function public.push_public_key() returns text
language sql stable security definer set search_path to 'public' as $$ select public_key from push_vapid where id = 1 $$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- one browser = one endpoint; if someone else was signed in on this device before, it moves to the current user
  insert into push_subscriptions(profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 290))
  on conflict (endpoint) do update set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, fail_count = 0, created_at = now();
  -- keep at most 5 devices per user
  delete from push_subscriptions where id in (select id from push_subscriptions where profile_id = auth.uid() order by created_at desc offset 5);
end $$;
revoke all on function public.push_subscribe(text, text, text, text) from public, anon;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;

create or replace function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path to 'public' as $$
  delete from push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid() $$;
revoke all on function public.push_unsubscribe(text) from public, anon;
grant execute on function public.push_unsubscribe(text) to authenticated;

-- Trigger: tell the order-push function an order changed in a push-worthy way. Body is only a hint.
create or replace function public.notify_order_push() returns trigger
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'placed')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.renotified_at is distinct from old.renotified_at)
         and new.status in ('placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled')) then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists orders_notify_push on public.orders;
create trigger orders_notify_push after insert or update of status, renotified_at on public.orders
  for each row execute function public.notify_order_push();

-- Test data cleanup keeps working: subscriptions cascade with profiles; drop the log for test orders too.
create or replace function public.fp_purge_push_log() returns void language sql security definer set search_path to 'public' as $$
  delete from push_log where order_id is not null and order_id not in (select id from orders) $$;
revoke all on function public.fp_purge_push_log() from public, anon, authenticated;
create or replace function public.fp_purge_push_log() returns void language sql security definer set search_path to 'public' as $$
  delete from push_log where (order_id is not null and order_id not in (select id from orders)) or created_at < now() - interval '30 days' $$;
revoke all on function public.fp_purge_push_log() from public, anon, authenticated;
select cron.unschedule('fp-purge-push-log') where exists (select 1 from cron.job where jobname = 'fp-purge-push-log');
select cron.schedule('fp-purge-push-log', '25 3 * * *', 'select public.fp_purge_push_log()');
