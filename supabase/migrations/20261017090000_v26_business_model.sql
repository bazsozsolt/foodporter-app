-- v26 phase 1: business model from the financial plan (16 Oct 2026).
-- Commission 25% delivered / 20% founding rate for a restaurant's first 3 months / 10% pickup, stored per order.
-- Distance-based delivery fee bands, €0.99 service fee on delivery, 5 km zone (admin 5-10 km), min-max contract defaults.

-- 1. settings: business-model values (admin-editable, readable like the other settings)
alter table public.settings
  add column if not exists commission_delivery_pct numeric(5,2) not null default 25,
  add column if not exists commission_intro_pct numeric(5,2) not null default 20,
  add column if not exists commission_intro_months int not null default 3,
  add column if not exists commission_pickup_pct numeric(5,2) not null default 10,
  add column if not exists delivery_fee_bands jsonb not null default '[{"max_km":3,"fee_cents":249},{"max_km":5,"fee_cents":349},{"max_km":10,"fee_cents":499}]'::jsonb,
  add column if not exists service_fee_on_pickup boolean not null default false,
  add column if not exists default_contract_kind text not null default 'min_max',
  add column if not exists minmax_default_min_h numeric(4,1) not null default 8,
  add column if not exists minmax_default_max_h numeric(4,1) not null default 16;

create or replace function public.fp_valid_fee_bands(b jsonb) returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(b) = 'array' and jsonb_array_length(b) between 1 and 6
    and not exists (select 1 from jsonb_array_elements(b) e
      where jsonb_typeof(e->'max_km') <> 'number' or jsonb_typeof(e->'fee_cents') <> 'number'
         or (e->>'max_km')::numeric not between 0.5 and 20 or (e->>'fee_cents')::numeric not between 100 and 999
         or (e->>'fee_cents')::numeric <> round((e->>'fee_cents')::numeric))
    and (select bool_and(k > coalesce(p, 0)) from (select (e->>'max_km')::numeric k, lag((e->>'max_km')::numeric) over (order by o) p
         from jsonb_array_elements(b) with ordinality x(e, o)) s)
$$;

alter table public.settings drop constraint if exists settings_zone_radius_km_check;
alter table public.settings drop constraint if exists settings_delivery_fee_cents_check;
update public.settings set zone_radius_km = 5, service_fee_cents = 99, delivery_fee_cents = 249, updated_at = now();
alter table public.settings
  add constraint settings_zone_radius_km_check check (zone_radius_km between 5 and 10),
  add constraint settings_delivery_fee_cents_check check (delivery_fee_cents between 100 and 999),
  add constraint settings_commission_check check (commission_delivery_pct between 5 and 35 and commission_intro_pct between 5 and 35
    and commission_pickup_pct between 0 and 35 and commission_intro_months between 0 and 12),
  add constraint settings_fee_bands_check check (fp_valid_fee_bands(delivery_fee_bands)),
  add constraint settings_contract_defaults_check check (default_contract_kind in ('min_max','on_call')
    and minmax_default_min_h > 0 and minmax_default_max_h >= minmax_default_min_h and minmax_default_max_h <= 40);

-- 2. fee for a distance (km): first band whose max_km >= distance; beyond the last band the last fee
create or replace function public.fp_delivery_fee(p_km numeric) returns int language sql stable set search_path = public as $$
  select coalesce(
    (select (e->>'fee_cents')::int from settings s, jsonb_array_elements(s.delivery_fee_bands) with ordinality x(e, o)
      where (e->>'max_km')::numeric >= greatest(coalesce(p_km, 0), 0) order by o limit 1),
    (select (e->>'fee_cents')::int from settings s, jsonb_array_elements(s.delivery_fee_bands) with ordinality x(e, o) order by o desc limit 1))
$$;

-- 3. restaurants: partner date (start of the founding-rate period) and an optional custom delivered rate
alter table public.restaurants add column if not exists partner_since date;
update public.restaurants r set partner_since = coalesce(
  (select min(la.accepted_at)::date from legal_acceptances la where la.restaurant_id = r.id and la.template_id = 'restaurant_partner'),
  r.created_at::date) where partner_since is null;
alter table public.restaurants drop constraint if exists restaurants_commission_pct_check;
alter table public.restaurants alter column commission_pct drop not null, alter column commission_pct drop default;

-- 4. orders: the rate is stored per order; history keeps the rate it was computed with
alter table public.orders add column if not exists commission_pct numeric(5,2);
update public.orders o set commission_pct = coalesce(r.commission_pct, 12),
  commission_cents = coalesce(o.commission_cents, round(o.subtotal_cents * coalesce(r.commission_pct, 12) / 100.0)::int)
  from restaurants r where r.id = o.restaurant_id and o.commission_pct is null;
update public.restaurants set commission_pct = null;  -- plan rates apply; admins can set a custom delivered rate per restaurant
alter table public.restaurants add constraint restaurants_commission_pct_check check (commission_pct is null or commission_pct between 5 and 35);

alter table public.orders drop constraint if exists orders_delivery_fee_cents_check;
alter table public.orders add constraint orders_delivery_fee_cents_check
  check ((fulfilment = 'pickup' and delivery_fee_cents = 0) or delivery_fee_cents between 100 and 999);

create or replace function public.fp_commission_rate(p_restaurant uuid, p_fulfilment text, p_at timestamptz default now())
returns numeric language sql stable set search_path = public as $$
  select case
    when p_fulfilment = 'pickup' then s.commission_pickup_pct
    when r.commission_pct is not null then r.commission_pct
    when p_at < (coalesce(r.partner_since, r.created_at::date) + make_interval(months => s.commission_intro_months)) then s.commission_intro_pct
    else s.commission_delivery_pct end
  from settings s, restaurants r where r.id = p_restaurant
$$;

-- set once the order is paid/placed (server side; runs after the guard triggers, alphabetically last)
create or replace function public.fp_order_commission() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('awaiting_payment', 'payment_failed', 'cancelled') then
    if new.commission_pct is null then
      new.commission_pct := fp_commission_rate(new.restaurant_id, coalesce(new.fulfilment, 'delivery'), coalesce(new.paid_at, now()));
    end if;
    new.commission_cents := round(new.subtotal_cents * new.commission_pct / 100.0)::int;
  end if;
  return new;
end $$;
drop trigger if exists orders_zz_commission on public.orders;
create trigger orders_zz_commission before insert or update on public.orders for each row execute function fp_order_commission();

-- clients can't set or change the commission fields
create or replace function public.sanitize_order_insert()
 returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.status := 'awaiting_payment'; new.rider_id := null; new.paid_at := null; new.payment_status := null;
    new.mollie_payment_id := null; new.refund_id := null; new.refund_status := null; new.refund_cents := null; new.refunded_at := null;
    new.accepted_at := null; new.assigned_at := null; new.ready_at := null; new.picked_up_at := null; new.delivered_at := null;
    new.cancelled_at := null; new.cancel_reason := null; new.prep_minutes := null; new.commission_cents := null; new.commission_pct := null;
    new.restaurant_payout_id := null; new.bid_window_closes_at := null; new.renotified_at := null; new.bid_alerted_at := null;
    new.sms_sent := '{}'; new.created_at := now();
    new.is_test := coalesce((select is_test from profiles where id = new.customer_id), false);
    new.delivery_fee_cents := (select delivery_fee_cents from settings limit 1);  -- placeholder; create-payment sets the distance fee
    if char_length(coalesce(new.address, '')) > 200 or char_length(coalesce(new.phone, '')) > 30 then
      raise exception 'address or phone too long';
    end if;
    if not exists (select 1 from restaurants where id = new.restaurant_id and active) then
      raise exception 'restaurant not available';
    end if;
  end if;
  return new;
end $function$;

create or replace function public.guard_order_update()
 returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.customer_id is distinct from old.customer_id
      or new.restaurant_id is distinct from old.restaurant_id
      or new.rider_id is distinct from old.rider_id
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.delivery_fee_cents is distinct from old.delivery_fee_cents
      or new.service_fee_cents is distinct from old.service_fee_cents
      or new.commission_cents is distinct from old.commission_cents
      or new.commission_pct is distinct from old.commission_pct
      or new.fulfilment is distinct from old.fulfilment and old.status not in ('awaiting_payment', 'payment_failed')
      or new.mollie_payment_id is distinct from old.mollie_payment_id
      or new.paid_at is distinct from old.paid_at
      or new.payment_status is distinct from old.payment_status
      or new.sms_sent is distinct from old.sms_sent
      or new.lat is distinct from old.lat or new.lng is distinct from old.lng or new.distance_km is distinct from old.distance_km
      or new.renotified_at is distinct from old.renotified_at or new.bid_alerted_at is distinct from old.bid_alerted_at
      or new.refund_id is distinct from old.refund_id or new.refund_status is distinct from old.refund_status
      or new.refund_cents is distinct from old.refund_cents or new.refunded_at is distinct from old.refunded_at
      or (new.cancel_reason is distinct from old.cancel_reason and new.status <> 'cancelled')
      or old.status in ('awaiting_payment', 'payment_failed') then
      raise exception 'not allowed to change these order fields';
    end if;
    if new.prep_minutes is distinct from old.prep_minutes
       and (old.status not in ('placed', 'accepted', 'assigned') or my_restaurant() is distinct from old.restaurant_id) then
      raise exception 'prep time can only be changed by the restaurant before the order is ready';
    end if;
  end if;
  return new;
end $function$;

-- 5. group checkout: placeholder fee (create-payment computes the distance fee)
-- (fee := settings.delivery_fee_cents is kept; it is within the new range)

-- 6. new riders: min-max by default (0-hours still selectable; banned from 1 Jan 2028)
create or replace function public.fp_rider_hr_defaults() returns trigger language plpgsql set search_path = public as $$
declare s settings;
begin
  select * into s from settings limit 1;
  if new.contract_kind is null then new.contract_kind := s.default_contract_kind; end if;
  if new.contract_kind = 'min_max' then
    new.min_hours_week := coalesce(new.min_hours_week, s.minmax_default_min_h);
    new.max_hours_week := coalesce(new.max_hours_week, s.minmax_default_max_h);
  end if;
  return new;
end $$;
alter table public.rider_hr alter column contract_kind drop default;  -- NOT NULL is checked after the BEFORE trigger fills it
drop trigger if exists rider_hr_a_defaults on public.rider_hr;
create trigger rider_hr_a_defaults before insert on public.rider_hr for each row execute function fp_rider_hr_defaults();

-- 7. reporting: stored per-order commission (fallback = the rate at order time)
create or replace view public.order_facts with (security_invoker = true) as
 SELECT o.id,
    o.created_at,
    o.status,
    o.restaurant_id,
    r.name AS restaurant_name,
    o.rider_id,
    o.customer_id,
    o.subtotal_cents,
    o.delivery_fee_cents,
    COALESCE(o.commission_pct, fp_commission_rate(o.restaurant_id, o.fulfilment, o.created_at)) AS commission_pct,
    COALESCE(o.commission_cents, (round((((o.subtotal_cents)::numeric * fp_commission_rate(o.restaurant_id, o.fulfilment, o.created_at)) / 100.0)))::integer) AS commission_cents,
    o.prep_minutes,
    o.accepted_at,
    o.ready_at,
    o.delivered_at,
    o.paid_at,
    o.restaurant_payout_id,
    COALESCE(o.assigned_at, b.created_at) AS bid_at,
    b.eta_minutes,
    b.rider_name,
    (EXTRACT(epoch FROM (COALESCE(o.assigned_at, b.created_at) - o.accepted_at)))::integer AS bid_seconds,
    ((COALESCE(o.assigned_at, b.created_at) - o.accepted_at) <= '00:03:00'::interval) AS fast_bid,
    (o.delivered_at <= (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes))) AS on_time,
        CASE
            WHEN ((o.delivered_at IS NOT NULL) AND (b.created_at IS NOT NULL)) THEN ((EXTRACT(epoch FROM (o.delivered_at - (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes)))))::integer / 60)
            ELSE NULL::integer
        END AS minutes_late,
        CASE
            WHEN ((o.status = ANY (ARRAY['ready'::order_status, 'picked_up'::order_status, 'delivered'::order_status])) AND (o.accepted_at IS NOT NULL) AND (o.ready_at IS NOT NULL)) THEN round((EXTRACT(epoch FROM (o.ready_at - o.accepted_at)) / 60.0), 1)
            ELSE NULL::numeric
        END AS actual_prep_minutes,
    (( SELECT count(*) AS count
           FROM audit_events e
          WHERE ((e.order_id = o.id) AND (e.type = 'prep_extended'::text))))::integer AS prep_extensions,
    (o.status <> ALL (ARRAY['awaiting_payment'::order_status, 'payment_failed'::order_status, 'cancelled'::order_status])) AS is_paid,
    (o.is_test OR (o.address ~~ 'FP TEST%'::text)) AS is_test,
    ((EXTRACT(hour FROM (COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam'::text)) >= (22)::numeric) OR (EXTRACT(hour FROM (COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam'::text)) < (6)::numeric)) AS late_night,
    rt.food_stars,
    rt.rider_stars,
    o.cancel_reason,
    o.refund_status,
    o.refund_cents,
    o.distance_km,
    o.stacked,
    o.fulfilment AS fulfilment_kind,
    o.service_fee_cents
   FROM (((orders o
     LEFT JOIN restaurants r ON ((r.id = o.restaurant_id)))
     LEFT JOIN bids b ON (((b.order_id = o.id) AND b.accepted)))
     LEFT JOIN ratings rt ON ((rt.order_id = o.id)));

create or replace function public.report_payments(p_from timestamp with time zone, p_to timestamp with time zone)
 returns jsonb language plpgsql stable set search_path to 'public' as $function$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'restaurants', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
      select jsonb_build_object('restaurant_id', r.id, 'restaurant', r.name,
        'commission_pct', fp_commission_rate(r.id, 'delivery', now()),   -- current delivered rate
        'pickup_pct', fp_commission_rate(r.id, 'pickup', now()),
        'effective_pct', case when coalesce(sum(f.subtotal_cents), 0) > 0 then round(100.0 * sum(f.commission_cents) / sum(f.subtotal_cents), 1) end,
        'partner_since', r.partner_since,
        'orders', count(f.id),
        'pickup_orders', count(f.id) filter (where f.fulfilment_kind = 'pickup'),
        'gross_cents', coalesce(sum(f.subtotal_cents), 0),
        'commission_cents', coalesce(sum(f.commission_cents), 0),
        'net_cents', coalesce(sum(f.subtotal_cents - f.commission_cents), 0),
        'paid_cents', coalesce(sum(f.subtotal_cents - f.commission_cents) filter (where f.restaurant_payout_id is not null), 0),
        'owed_cents', coalesce(sum(f.subtotal_cents - f.commission_cents) filter (where f.restaurant_payout_id is null), 0)) x
      from restaurants r
      left join order_facts f on f.restaurant_id = r.id and f.status = 'delivered' and f.delivered_at >= p_from and f.delivered_at < p_to
      group by r.id, r.name, r.partner_since) s),
    'riders', (select coalesce(jsonb_agg(x order by x->>'rider'), '[]'::jsonb) from (
      select jsonb_build_object('rider_id', p.id, 'rider', coalesce(p.full_name, p.email), 'status', p.status,
        'deliveries', count(e.id),
        'earned_cents', coalesce(sum(e.amount_cents), 0),
        'tip_cents', coalesce(sum(e.tip_cents), 0),
        'paid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is not null), 0),
        'unpaid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is null), 0)) x
      from profiles p
      join earnings e on e.rider_id = p.id and e.earned_at >= p_from and e.earned_at < p_to
      group by p.id, p.full_name, p.email, p.status) s)
  ) into res;
  return res;
end $function$;

-- the partner date starts on the first signature of the partner agreement when an admin didn't set one
create or replace function public.fp_partner_since_on_sign() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.template_id = 'restaurant_partner' and new.restaurant_id is not null and new.method <> 'test_seed' then
    update restaurants set partner_since = coalesce(partner_since, new.accepted_at::date) where id = new.restaurant_id;
  end if;
  return new;
end $$;
drop trigger if exists legal_acceptances_partner_since on public.legal_acceptances;
create trigger legal_acceptances_partner_since after insert on public.legal_acceptances for each row execute function fp_partner_since_on_sign();
revoke all on function public.fp_partner_since_on_sign() from public, anon, authenticated;
