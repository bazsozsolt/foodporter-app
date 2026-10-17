-- v27: split the delivery fee (Zsolt, 17 Oct 2026). Riders get a fixed per-delivery bonus (settings.rider_bonus_cents, default 50,
-- 0-200), stored on the order at payment; the rest of the delivery fee plus the service fee is Food Porter revenue. Tips stay 100% rider.
-- Orders paid before v27 keep rider_bonus_cents NULL = old terms (rider gets the full delivery fee); no backfill, so 1043/1046 are untouched.
alter table public.settings add column if not exists rider_bonus_cents int not null default 50;
alter table public.settings drop constraint if exists settings_rider_bonus_check;
alter table public.settings add constraint settings_rider_bonus_check check (rider_bonus_cents between 0 and 200);
alter table public.orders add column if not exists rider_bonus_cents int;
alter table public.orders drop constraint if exists orders_rider_bonus_check;
alter table public.orders add constraint orders_rider_bonus_check check (rider_bonus_cents is null or rider_bonus_cents between 0 and 999);
grant select (rider_bonus_cents) on public.orders to authenticated;

-- set once, on the payment transition (or a paid insert), next to the commission rate
create or replace function public.fp_order_commission() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status not in ('awaiting_payment', 'payment_failed', 'cancelled') then
    if new.commission_pct is null then
      new.commission_pct := fp_commission_rate(new.restaurant_id, coalesce(new.fulfilment, 'delivery'), coalesce(new.paid_at, now()));
    end if;
    new.commission_cents := round(new.subtotal_cents * new.commission_pct / 100.0)::int;
    if new.rider_bonus_cents is null and (tg_op = 'INSERT' or old.status in ('awaiting_payment', 'payment_failed')) then
      new.rider_bonus_cents := case when new.fulfilment = 'pickup' then 0
        else least(new.delivery_fee_cents, (select rider_bonus_cents from settings limit 1)) end;
    end if;
  end if;
  return new;
end $$;

create or replace function public.credit_rider_on_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.rider_id is not null then
    insert into earnings (rider_id, order_id, amount_cents, tip_cents)
    values (new.rider_id, new.id, coalesce(new.rider_bonus_cents, new.delivery_fee_cents) + coalesce(new.tip_cents, 0), coalesce(new.tip_cents, 0))
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.sanitize_order_insert()
 returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.status := 'awaiting_payment'; new.rider_id := null; new.paid_at := null; new.payment_status := null;
    new.mollie_payment_id := null; new.refund_id := null; new.refund_status := null; new.refund_cents := null; new.refunded_at := null;
    new.accepted_at := null; new.assigned_at := null; new.ready_at := null; new.picked_up_at := null; new.delivered_at := null;
    new.cancelled_at := null; new.cancel_reason := null; new.prep_minutes := null; new.commission_cents := null; new.commission_pct := null; new.rider_bonus_cents := null;
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
      or new.rider_bonus_cents is distinct from old.rider_bonus_cents
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
    o.service_fee_cents,
    COALESCE(o.rider_bonus_cents, CASE WHEN o.fulfilment = 'pickup' THEN 0 ELSE o.delivery_fee_cents END) AS rider_bonus_cents,
    (COALESCE(o.commission_cents, (round((((o.subtotal_cents)::numeric * fp_commission_rate(o.restaurant_id, o.fulfilment, o.created_at)) / 100.0)))::integer)
      + o.delivery_fee_cents - COALESCE(o.rider_bonus_cents, CASE WHEN o.fulfilment = 'pickup' THEN 0 ELSE o.delivery_fee_cents END)
      + COALESCE(o.service_fee_cents, 0)) AS company_revenue_cents,
    o.tip_cents
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
      group by p.id, p.full_name, p.email, p.status) s),
    -- v27: company revenue = commission + (delivery fee - rider bonus) + service fee, on delivered orders in the period
    'platform', (select jsonb_build_object('orders', count(*), 'pickup_orders', count(*) filter (where f.fulfilment_kind = 'pickup'),
        'commission_cents', coalesce(sum(f.commission_cents), 0), 'delivery_fee_cents', coalesce(sum(f.delivery_fee_cents), 0),
        'rider_bonus_cents', coalesce(sum(f.rider_bonus_cents), 0), 'service_fee_cents', coalesce(sum(f.service_fee_cents), 0),
        'tip_cents', coalesce(sum(f.tip_cents), 0), 'company_revenue_cents', coalesce(sum(f.company_revenue_cents), 0))
      from order_facts f where f.status = 'delivered' and f.delivered_at >= p_from and f.delivered_at < p_to)
  ) into res;
  return res;
end $function$;
