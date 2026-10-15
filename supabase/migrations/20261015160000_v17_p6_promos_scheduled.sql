-- v17 P6: promo codes (admin), referral credit, scheduled orders.
-- Discounts are funded by the platform: restaurant payouts (subtotal - commission) and rider pay are unchanged.

create table if not exists promo_codes (
  code text primary key check (code ~ '^[A-Z0-9]{3,20}$'),
  kind text not null check (kind in ('percent', 'fixed')),
  value int not null check (value > 0),
  min_order_cents int not null default 0 check (min_order_cents >= 0),
  first_order_only boolean not null default false,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  is_test boolean not null default false,
  created_by uuid references profiles, created_at timestamptz not null default now(),
  constraint promo_value_range check ((kind = 'percent' and value between 1 and 50) or (kind = 'fixed' and value between 50 and 2500))
);
alter table promo_codes enable row level security;
drop policy if exists "promo admin" on promo_codes;
create policy "promo admin" on promo_codes for all to authenticated using ((select my_role()) = 'admin') with check ((select my_role()) = 'admin');

-- referral codes and a credit ledger
create table if not exists referral_codes (customer_id uuid primary key references profiles on delete cascade, code text unique not null check (code ~ '^[A-Z0-9]{6,12}$'), created_at timestamptz not null default now());
alter table referral_codes enable row level security;
drop policy if exists "referral own" on referral_codes;
create policy "referral own" on referral_codes for select to authenticated using (customer_id = (select auth.uid()) or (select my_role()) = 'admin');

create table if not exists customer_credit (
  id bigserial primary key, customer_id uuid not null references profiles on delete cascade, cents int not null,
  reason text not null check (reason in ('referral_new', 'referral_friend', 'used', 'admin', 'refund')),
  order_id bigint references orders, created_at timestamptz not null default now(),
  unique (order_id, customer_id, reason)
);
alter table customer_credit enable row level security;
drop policy if exists "credit own" on customer_credit;
create policy "credit own" on customer_credit for select to authenticated using (customer_id = (select auth.uid()) or (select my_role()) = 'admin');

alter table orders add column if not exists promo_code text;
alter table orders add column if not exists referral_code text;
alter table orders add column if not exists discount_cents int not null default 0 check (discount_cents >= 0);
alter table orders add column if not exists credit_cents int not null default 0 check (credit_cents >= 0);
alter table orders add column if not exists scheduled_for timestamptz;
alter table orders add column if not exists release_at timestamptz;
grant select (promo_code, referral_code, discount_cents, credit_cents, scheduled_for, release_at) on orders to authenticated;
grant insert (scheduled_for) on orders to authenticated;

create or replace function public.my_referral_code() returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'sign in'; end if;
  select code into c from referral_codes where customer_id = auth.uid();
  if c is null then
    loop
      c := upper(substr(md5(random()::text || auth.uid()::text), 1, 8));
      c := translate(c, '0O1I', '7K8M');
      begin insert into referral_codes (customer_id, code) values (auth.uid(), c); exit; exception when unique_violation then end;
    end loop;
  end if;
  return c;
end $$;
grant execute on function public.my_referral_code() to authenticated;

create or replace function public.my_credit_cents() returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(cents), 0)::int from customer_credit where customer_id = auth.uid()
$$;
grant execute on function public.my_credit_cents() to authenticated;

-- Pricing helper used by create-payment (service role) and the checkout preview (customer). Never trusts client amounts.
create or replace function public.fp_quote_discount(p_customer uuid, p_subtotal int, p_code text, p_use_credit boolean, p_order bigint default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pc promo_codes; v_code text := upper(btrim(coalesce(p_code, ''))); disc int := 0; credit int := 0; bal int; prev int; kind text := null; ref_owner uuid; err text := null;
begin
  if auth.uid() is not null and auth.uid() <> p_customer then raise exception 'not allowed'; end if;
  select count(*) into prev from orders where customer_id = p_customer and paid_at is not null and (p_order is null or id <> p_order);
  if v_code <> '' then
    select * into pc from promo_codes where promo_codes.code = v_code;
    if found then
      kind := 'promo';
      if not pc.active then err := 'Deze code is niet meer geldig.';
      elsif pc.expires_at is not null and pc.expires_at < now() then err := 'Deze code is verlopen.';
      elsif pc.max_uses is not null and pc.uses >= pc.max_uses then err := 'Deze code is op.';
      elsif pc.first_order_only and prev > 0 then err := 'Deze code geldt alleen voor je eerste bestelling.';
      elsif p_subtotal < pc.min_order_cents then err := format('Deze code geldt vanaf €%s aan gerechten.', to_char(pc.min_order_cents / 100.0, 'FM990.00'));
      elsif exists (select 1 from orders where customer_id = p_customer and promo_code = v_code and paid_at is not null and (p_order is null or id <> p_order)) then err := 'Je hebt deze code al gebruikt.';
      else disc := case when pc.kind = 'percent' then (p_subtotal * pc.value) / 100 else least(pc.value, p_subtotal) end;
      end if;
    else
      select customer_id into ref_owner from referral_codes where referral_codes.code = v_code;
      if ref_owner is null then err := 'Onbekende code.';
      else
        kind := 'referral';
        if ref_owner = p_customer then err := 'Je kunt je eigen code niet gebruiken.';
        elsif prev > 0 then err := 'Een uitnodigingscode geldt alleen voor je eerste bestelling.';
        else disc := least(500, p_subtotal); end if;
      end if;
    end if;
  end if;
  if p_use_credit then
    select coalesce(sum(cents), 0) into bal from customer_credit where customer_id = p_customer;
    credit := greatest(0, least(bal, p_subtotal - disc));
  end if;
  return jsonb_build_object('kind', kind, 'code', case when err is null and kind is not null then v_code end, 'discount_cents', case when err is null then disc else 0 end, 'credit_cents', credit, 'error', err);
end $$;
revoke all on function public.fp_quote_discount(uuid, int, text, boolean, bigint) from public, anon;
grant execute on function public.fp_quote_discount(uuid, int, text, boolean, bigint) to authenticated;

-- guard: pricing/schedule fields are written by create-payment only
create or replace function public.fp_guard_p6() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(my_role()::text, '') <> 'admin' then
    if new.promo_code is distinct from old.promo_code or new.referral_code is distinct from old.referral_code or new.discount_cents is distinct from old.discount_cents
       or new.credit_cents is distinct from old.credit_cents or new.release_at is distinct from old.release_at
       or (new.scheduled_for is distinct from old.scheduled_for and old.status not in ('awaiting_payment', 'payment_failed')) then
      raise exception 'not allowed to change pricing or schedule';
    end if;
    if old.status = 'placed' and new.status = 'accepted' and old.release_at is not null and old.release_at > now() + interval '5 minutes' then
      raise exception 'Geplande bestelling: accepteren kan vanaf %', to_char(old.release_at at time zone 'Europe/Amsterdam', 'HH24:MI');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_p6 on orders;
create trigger orders_guard_p6 before update on orders for each row execute function fp_guard_p6();

-- on payment (status -> placed): count the promo use, book credit used, and referral credit for both
create or replace function public.fp_on_paid_p6() returns trigger language plpgsql security definer set search_path = public as $$
declare ref_owner uuid;
begin
  if new.status = 'placed' and old.status in ('awaiting_payment', 'payment_failed') then
    if new.promo_code is not null then update promo_codes set uses = uses + 1 where code = new.promo_code; end if;
    if new.credit_cents > 0 then
      insert into customer_credit (customer_id, cents, reason, order_id) values (new.customer_id, -new.credit_cents, 'used', new.id) on conflict do nothing;
    end if;
    if new.referral_code is not null then
      select customer_id into ref_owner from referral_codes where code = new.referral_code;
      if ref_owner is not null and ref_owner <> new.customer_id then
        insert into customer_credit (customer_id, cents, reason, order_id) values (ref_owner, 500, 'referral_friend', new.id) on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_on_paid_p6 on orders;
create trigger orders_on_paid_p6 after update of status on orders for each row execute function fp_on_paid_p6();

-- restaurant timeout counts from the release time for scheduled orders
create or replace function public.fp_run_timeouts() returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare s settings; n_exp int; n_rest int; n_renotify int; n_alert int;
begin
  select * into s from settings limit 1;
  update orders set status = 'payment_failed', payment_status = 'expired'
    where status = 'awaiting_payment' and created_at < now() - make_interval(mins => s.unpaid_expiry_minutes);
  get diagnostics n_exp = row_count;

  with c as (
    update orders set status = 'cancelled', cancel_reason = 'restaurant_timeout'
    where status = 'placed' and greatest(coalesce(paid_at, created_at), coalesce(release_at, '-infinity')) < now() - make_interval(mins => s.restaurant_accept_minutes)
    returning id)
  insert into ops_alerts(kind, order_id, message)
    select 'restaurant_timeout', id, format('Restaurant did not accept within %s min: order cancelled, refund started', s.restaurant_accept_minutes) from c;
  get diagnostics n_rest = row_count;

  update orders set renotified_at = now()
    where status = 'accepted' and rider_id is null and renotified_at is null
      and accepted_at < now() - make_interval(secs => s.bid_window_seconds);
  get diagnostics n_renotify = row_count;

  with a as (
    update orders set bid_alerted_at = now()
    where status = 'accepted' and rider_id is null and bid_alerted_at is null
      and accepted_at < now() - make_interval(mins => s.no_bid_alert_minutes)
    returning id)
  insert into ops_alerts(kind, order_id, message)
    select 'no_bid', id, format('No rider bid within %s min. Re-notified riders; consider calling riders or cancelling + refunding.', s.no_bid_alert_minutes) from a;
  get diagnostics n_alert = row_count;

  return jsonb_build_object('expired', n_exp, 'restaurant_timeouts', n_rest, 'renotified', n_renotify, 'no_bid_alerts', n_alert);
end $function$;

-- seed test promo codes (marked is_test)
insert into promo_codes (code, kind, value, min_order_cents, first_order_only, max_uses, expires_at, is_test) values
  ('TESTWELKOM', 'percent', 20, 1000, true, 500, now() + interval '90 days', true),
  ('TESTVIJF', 'fixed', 500, 2000, false, 100, now() + interval '30 days', true)
on conflict (code) do nothing;
