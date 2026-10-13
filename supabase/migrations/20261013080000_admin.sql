-- Food Porter: admin back office (accounts, settings, audit events, incidents, payouts, reports)

-- ===== Accounts: email + status on profiles =====
alter table profiles add column if not exists email text;
alter table profiles add column if not exists status text not null default 'active'
  check (status in ('active', 'pending', 'suspended', 'blocked'));
alter table profiles add column if not exists status_reason text;
alter table profiles add column if not exists status_changed_at timestamptz;
update profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email) values (new.id, new.raw_user_meta_data->>'full_name', new.email);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function my_status() returns text language sql stable security definer set search_path = public as
  $$ select status from profiles where id = auth.uid() $$;
revoke execute on function public.my_status() from public, anon;
grant execute on function public.my_status() to authenticated;

-- Only admins can change role/status/email
create or replace function guard_profile_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.role is distinct from old.role or new.status is distinct from old.status
       or new.email is distinct from old.email or new.restaurant_id is distinct from old.restaurant_id then
      raise exception 'not allowed to change account status or role';
    end if;
  end if;
  if new.status is distinct from old.status then new.status_changed_at := now(); end if;
  return new;
end $$;
revoke execute on function public.guard_profile_update() from public, anon, authenticated;
drop trigger if exists profiles_guard_update on profiles;
create trigger profiles_guard_update before update on profiles for each row execute function guard_profile_update();

-- Blocked customers can't order; suspended/pending riders can't bid
drop policy if exists "customer creates order" on orders;
create policy "customer creates order" on orders for insert to authenticated
  with check (customer_id = auth.uid() and status = 'awaiting_payment' and coalesce(my_status(), 'active') = 'active');
drop policy if exists "riders bid" on bids;
create policy "riders bid" on bids for insert to authenticated
  with check (rider_id = auth.uid() and my_role() = 'rider' and my_status() = 'active' and accepted = false);

-- ===== Settings (single row) =====
create table if not exists settings (
  id boolean primary key default true check (id),
  delivery_fee_cents int not null default 295 check (delivery_fee_cents between 250 and 350),
  zone_radius_km numeric(4,1) not null default 3.0 check (zone_radius_km between 0.5 and 20),
  bid_window_seconds int not null default 180 check (bid_window_seconds between 30 and 900),
  updated_at timestamptz not null default now()
);
insert into settings (id) values (true) on conflict do nothing;
alter table settings enable row level security;
create policy "settings readable" on settings for select to anon, authenticated using (true);
create policy "admin settings" on settings for update to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- ===== Audit events (status changes, prep set/extended, account status changes) =====
create table if not exists audit_events (
  id bigint generated always as identity primary key,
  order_id bigint references orders on delete cascade,
  profile_id uuid references profiles on delete cascade,
  type text not null,               -- status_change | prep_set | prep_extended | prep_reduced | account_status
  from_value text,
  to_value text,
  actor uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists audit_events_order_idx on audit_events(order_id);
create index if not exists audit_events_type_time_idx on audit_events(type, created_at);
alter table audit_events enable row level security;
create policy "admin audit" on audit_events for select to authenticated using (my_role() = 'admin');

create or replace function log_order_events() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_events (order_id, type, to_value) values (new.id, 'status_change', new.status::text);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into audit_events (order_id, type, from_value, to_value) values (new.id, 'status_change', old.status::text, new.status::text);
  end if;
  if new.prep_minutes is distinct from old.prep_minutes then
    insert into audit_events (order_id, type, from_value, to_value) values (new.id,
      case when old.prep_minutes is null then 'prep_set' when new.prep_minutes > old.prep_minutes then 'prep_extended' else 'prep_reduced' end,
      old.prep_minutes::text, new.prep_minutes::text);
  end if;
  return new;
end $$;
revoke execute on function public.log_order_events() from public, anon, authenticated;
drop trigger if exists orders_log_events on orders;
create trigger orders_log_events after insert or update on orders for each row execute function log_order_events();

create or replace function log_profile_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into audit_events (profile_id, type, from_value, to_value) values (new.id, 'account_status', old.status, new.status);
  end if;
  return new;
end $$;
revoke execute on function public.log_profile_status() from public, anon, authenticated;
drop trigger if exists profiles_log_status on profiles;
create trigger profiles_log_status after update on profiles for each row execute function log_profile_status();

-- Backfill history for existing orders
insert into audit_events (order_id, type, to_value, created_at)
select id, 'status_change', status::text, created_at from orders o
where not exists (select 1 from audit_events e where e.order_id = o.id);

-- ===== Incidents =====
create table if not exists incidents (
  id bigint generated always as identity primary key,
  type text not null check (type in ('accident', 'harassment', 'food_safety', 'damaged_goods', 'late_delivery', 'complaint', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  order_id bigint references orders on delete set null,
  rider_id uuid references profiles on delete set null,
  restaurant_id uuid references restaurants on delete set null,
  description text,
  created_by uuid default auth.uid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table incidents enable row level security;
create policy "admin incidents" on incidents for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- ===== Payouts for riders AND restaurants =====
alter table payouts alter column rider_id drop not null;
alter table payouts alter column week_start drop not null;
alter table payouts add column if not exists restaurant_id uuid references restaurants;
alter table payouts add column if not exists period_start date;
alter table payouts add column if not exists period_end date;
alter table payouts add column if not exists created_at timestamptz not null default now();
alter table payouts drop constraint if exists payouts_rider_id_week_start_key;
alter table payouts drop constraint if exists payouts_one_party;
alter table payouts add constraint payouts_one_party check ((rider_id is null) <> (restaurant_id is null));
alter table orders add column if not exists restaurant_payout_id uuid references payouts;

-- ===== Report helpers (security invoker; admin-only) =====
create or replace function assert_admin() returns void language plpgsql stable set search_path = public as $$
begin
  if coalesce(my_role()::text, '') <> 'admin' then raise exception 'admin only'; end if;
end $$;

-- Per-order facts used by every report. Times in Europe/Amsterdam for "late night".
create or replace view order_facts with (security_invoker = true) as
select o.id, o.created_at, o.status, o.restaurant_id, r.name as restaurant_name, o.rider_id, o.customer_id,
  o.subtotal_cents, o.delivery_fee_cents, coalesce(r.commission_pct, 12) as commission_pct,
  round(o.subtotal_cents * coalesce(r.commission_pct, 12) / 100.0)::int as commission_cents,
  o.prep_minutes, o.accepted_at, o.ready_at, o.delivered_at, o.paid_at, o.restaurant_payout_id,
  b.created_at as bid_at, b.eta_minutes, b.rider_name,
  extract(epoch from (b.created_at - o.accepted_at))::int as bid_seconds,
  (b.created_at - o.accepted_at) <= interval '3 minutes' as fast_bid,
  (o.delivered_at <= b.created_at + make_interval(mins => b.eta_minutes)) as on_time,
  case when o.delivered_at is not null and b.created_at is not null
    then extract(epoch from (o.delivered_at - (b.created_at + make_interval(mins => b.eta_minutes))))::int / 60 end as minutes_late,
  case when o.status in ('ready', 'picked_up', 'delivered') and o.accepted_at is not null and o.ready_at is not null
    then round(extract(epoch from (o.ready_at - o.accepted_at)) / 60.0, 1) end as actual_prep_minutes,
  (select count(*) from audit_events e where e.order_id = o.id and e.type = 'prep_extended')::int as prep_extensions,
  o.status not in ('awaiting_payment', 'payment_failed', 'cancelled') as is_paid,
  o.address like 'FP TEST%' as is_test,
  extract(hour from (coalesce(o.delivered_at, o.created_at) at time zone 'Europe/Amsterdam')) >= 22
    or extract(hour from (coalesce(o.delivered_at, o.created_at) at time zone 'Europe/Amsterdam')) < 6 as late_night
from orders o
left join restaurants r on r.id = o.restaurant_id
left join bids b on b.order_id = o.id and b.accepted;

create or replace function report_delivery(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'orders', count(*) filter (where is_paid),
    'delivered', count(*) filter (where status = 'delivered'),
    'with_bid', count(bid_at),
    'avg_bid_seconds', round(avg(bid_seconds)),
    'pct_bid_3min', round(100.0 * count(*) filter (where fast_bid) / nullif(count(bid_at), 0), 1),
    'pct_on_time', round(100.0 * count(*) filter (where on_time) / nullif(count(*) filter (where status = 'delivered'), 0), 1),
    'pct_key_metric', round(100.0 * count(*) filter (where fast_bid and on_time) / nullif(count(*) filter (where is_paid), 0), 1),
    'avg_prep_planned', round(avg(prep_minutes) filter (where actual_prep_minutes is not null), 1),
    'avg_prep_actual', round(avg(actual_prep_minutes), 1),
    'late', coalesce(jsonb_agg(jsonb_build_object('id', id, 'restaurant', restaurant_name, 'rider', rider_name, 'eta', eta_minutes,
              'minutes_late', minutes_late, 'delivered_at', delivered_at) order by id) filter (where status = 'delivered' and not on_time), '[]'::jsonb)
  ) into res
  from order_facts where created_at >= p_from and created_at < p_to;
  return res;
end $$;

create or replace function report_quality(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'orders', (select count(*) from orders where created_at >= p_from and created_at < p_to),
    'cancelled', (select count(*) from orders where status = 'cancelled' and created_at >= p_from and created_at < p_to),
    'payment_failed', (select count(*) from orders where status = 'payment_failed' and created_at >= p_from and created_at < p_to),
    'awaiting_payment', (select count(*) from orders where status = 'awaiting_payment' and created_at >= p_from and created_at < p_to),
    'prep_extensions', (select count(*) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'orders_extended', (select count(distinct order_id) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'extension_minutes', (select coalesce(sum(to_value::int - from_value::int), 0) from audit_events where type = 'prep_extended' and created_at >= p_from and created_at < p_to),
    'incidents_by_type', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) n from incidents where occurred_at >= p_from and occurred_at < p_to group by type) t),
    'by_restaurant', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
        select jsonb_build_object('restaurant', r.name,
          'orders', (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and o.status not in ('awaiting_payment','payment_failed')),
          'extensions', (select count(*) from audit_events e join orders o on o.id = e.order_id where o.restaurant_id = r.id and e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to),
          'incidents', (select count(*) from incidents i where i.restaurant_id = r.id and i.occurred_at >= p_from and i.occurred_at < p_to),
          'rating', null) x
        from restaurants r) s)
  ) into res;
  return res;
end $$;

create or replace function report_safety(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'incidents_open', (select count(*) from incidents where status = 'open' and occurred_at >= p_from and occurred_at < p_to),
    'incidents_total', (select count(*) from incidents where occurred_at >= p_from and occurred_at < p_to),
    'by_severity', (select coalesce(jsonb_object_agg(severity, n), '{}'::jsonb) from (select severity, count(*) n from incidents where occurred_at >= p_from and occurred_at < p_to group by severity) t),
    'suspensions', (select count(*) from audit_events where type = 'account_status' and to_value = 'suspended' and created_at >= p_from and created_at < p_to),
    'currently_suspended_riders', (select count(*) from profiles where role = 'rider' and status = 'suspended'),
    'late_night_deliveries', (select count(*) from order_facts where status = 'delivered' and late_night and delivered_at >= p_from and delivered_at < p_to)
  ) into res;
  return res;
end $$;

create or replace function report_payments(p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'restaurants', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
      select jsonb_build_object('restaurant_id', r.id, 'restaurant', r.name, 'commission_pct', r.commission_pct,
        'orders', count(f.id),
        'gross_cents', coalesce(sum(f.subtotal_cents), 0),
        'commission_cents', coalesce(sum(f.commission_cents), 0),
        'net_cents', coalesce(sum(f.subtotal_cents - f.commission_cents), 0),
        'paid_cents', coalesce(sum(f.subtotal_cents - f.commission_cents) filter (where f.restaurant_payout_id is not null), 0),
        'owed_cents', coalesce(sum(f.subtotal_cents - f.commission_cents) filter (where f.restaurant_payout_id is null), 0)) x
      from restaurants r
      left join order_facts f on f.restaurant_id = r.id and f.status = 'delivered' and f.delivered_at >= p_from and f.delivered_at < p_to
      group by r.id, r.name, r.commission_pct) s),
    'riders', (select coalesce(jsonb_agg(x order by x->>'rider'), '[]'::jsonb) from (
      select jsonb_build_object('rider_id', p.id, 'rider', coalesce(p.full_name, p.email), 'status', p.status,
        'deliveries', count(e.id),
        'earned_cents', coalesce(sum(e.amount_cents), 0),
        'paid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is not null), 0),
        'unpaid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is null), 0)) x
      from profiles p
      join earnings e on e.rider_id = p.id and e.earned_at >= p_from and e.earned_at < p_to
      group by p.id, p.full_name, p.email, p.status) s)
  ) into res;
  return res;
end $$;

-- Mark payouts as paid: creates a payouts row and links the covered earnings / orders
create or replace function mark_rider_payout(p_rider uuid, p_from timestamptz, p_to timestamptz, p_reference text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare pid uuid; amt int;
begin
  perform assert_admin();
  select coalesce(sum(amount_cents), 0) into amt from earnings where rider_id = p_rider and payout_id is null and earned_at >= p_from and earned_at < p_to;
  if amt = 0 then raise exception 'nothing unpaid for this rider in the period'; end if;
  insert into payouts (rider_id, period_start, period_end, week_start, amount_cents, paid_at, reference)
    values (p_rider, p_from::date, (p_to - interval '1 second')::date, date_trunc('week', p_from)::date, amt, now(), p_reference) returning id into pid;
  update earnings set payout_id = pid where rider_id = p_rider and payout_id is null and earned_at >= p_from and earned_at < p_to;
  return pid;
end $$;

create or replace function mark_restaurant_payout(p_restaurant uuid, p_from timestamptz, p_to timestamptz, p_reference text default null) returns uuid
language plpgsql security invoker set search_path = public as $$
declare pid uuid; amt int;
begin
  perform assert_admin();
  select coalesce(sum(subtotal_cents - commission_cents), 0) into amt from order_facts
    where restaurant_id = p_restaurant and status = 'delivered' and restaurant_payout_id is null and delivered_at >= p_from and delivered_at < p_to;
  if amt = 0 then raise exception 'nothing owed to this restaurant in the period'; end if;
  insert into payouts (restaurant_id, period_start, period_end, amount_cents, paid_at, reference)
    values (p_restaurant, p_from::date, (p_to - interval '1 second')::date, amt, now(), p_reference) returning id into pid;
  update orders set restaurant_payout_id = pid where restaurant_id = p_restaurant and status = 'delivered'
    and restaurant_payout_id is null and delivered_at >= p_from and delivered_at < p_to;
  return pid;
end $$;

revoke execute on function public.assert_admin(), public.report_delivery(timestamptz, timestamptz), public.report_quality(timestamptz, timestamptz),
  public.report_safety(timestamptz, timestamptz), public.report_payments(timestamptz, timestamptz),
  public.mark_rider_payout(uuid, timestamptz, timestamptz, text), public.mark_restaurant_payout(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.assert_admin(), public.report_delivery(timestamptz, timestamptz), public.report_quality(timestamptz, timestamptz),
  public.report_safety(timestamptz, timestamptz), public.report_payments(timestamptz, timestamptz),
  public.mark_rider_payout(uuid, timestamptz, timestamptz, text), public.mark_restaurant_payout(uuid, timestamptz, timestamptz, text) to authenticated;
revoke all on order_facts from anon;
