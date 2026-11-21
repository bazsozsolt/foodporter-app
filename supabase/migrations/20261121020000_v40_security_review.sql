-- v40 security review (not applied live in this PR).
-- - Add p_include_test to report_payments, report_delivery, report_quality, report_safety
--   (same default and meaning as report_key_metric / report_groups: default true = include test).
-- - Revoke leftover anon write/read grants on tables that have no anon policies
--   (RLS already denied access; this is defence in depth).
-- - Revoke write grants on legal_templates_current (security_invoker view; keep SELECT).
-- - Record the already-applied v34 token fix in schema_migrations if it is still missing.
--
-- Documented, not changed here:
-- * public.call_config, push_log, push_vapid, rate_limits: RLS on, no policies, grants
--   only to service_role. Intended (edge functions / cron). Anon and authenticated have
--   no table grants, so they cannot read or write these tables.
-- * public.fp_restaurant_open is SECURITY DEFINER and executable by anon on purpose:
--   it only returns whether a restaurant is open at a given time (hours, pause, legal
--   ready flag). No PII. The public menu needs this before sign-in.

-- ---------------------------------------------------------------------------
-- Reports: drop 2-arg overloads, replace with 3-arg (default keeps current behaviour)
-- ---------------------------------------------------------------------------
drop function if exists public.report_payments(timestamp with time zone, timestamp with time zone);
drop function if exists public.report_delivery(timestamp with time zone, timestamp with time zone);
drop function if exists public.report_quality(timestamp with time zone, timestamp with time zone);
drop function if exists public.report_safety(timestamp with time zone, timestamp with time zone);

create or replace function public.report_payments(p_from timestamp with time zone, p_to timestamp with time zone, p_include_test boolean default true)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'restaurants', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
      select jsonb_build_object('restaurant_id', r.id, 'restaurant', r.name,
        'commission_pct', fp_commission_rate(r.id, 'delivery', now()),
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
        and (p_include_test or not f.is_test)
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
      join orders o on o.id = e.order_id and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))
      group by p.id, p.full_name, p.email, p.status) s),
    'platform', (select jsonb_build_object('orders', count(*), 'pickup_orders', count(*) filter (where f.fulfilment_kind = 'pickup'),
        'commission_cents', coalesce(sum(f.commission_cents), 0), 'delivery_fee_cents', coalesce(sum(f.delivery_fee_cents), 0),
        'rider_bonus_cents', coalesce(sum(f.rider_bonus_cents), 0), 'service_fee_cents', coalesce(sum(f.service_fee_cents), 0),
        'tip_cents', coalesce(sum(f.tip_cents), 0), 'company_revenue_cents', coalesce(sum(f.company_revenue_cents), 0))
      from order_facts f where f.status = 'delivered' and f.delivered_at >= p_from and f.delivered_at < p_to
        and (p_include_test or not f.is_test))
  ) into res;
  return res;
end
$function$;

create or replace function public.report_delivery(p_from timestamp with time zone, p_to timestamp with time zone, p_include_test boolean default true)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
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
    'stacked', jsonb_build_object(
      'stacked_delivered', count(*) filter (where status = 'delivered' and stacked),
      'single_delivered', count(*) filter (where status = 'delivered' and not stacked),
      'stacked_pct_on_time', round(100.0 * count(*) filter (where on_time and stacked) / nullif(count(*) filter (where status = 'delivered' and stacked), 0), 1),
      'single_pct_on_time', round(100.0 * count(*) filter (where on_time and not stacked) / nullif(count(*) filter (where status = 'delivered' and not stacked), 0), 1),
      'stacked_avg_minutes_late', round(avg(greatest(minutes_late, 0)) filter (where status = 'delivered' and stacked), 1),
      'single_avg_minutes_late', round(avg(greatest(minutes_late, 0)) filter (where status = 'delivered' and not stacked), 1)),
    'late', coalesce(jsonb_agg(jsonb_build_object('id', id, 'restaurant', restaurant_name, 'rider', rider_name, 'eta', eta_minutes,
              'minutes_late', minutes_late, 'delivered_at', delivered_at, 'stacked', stacked) order by id) filter (where status = 'delivered' and not on_time), '[]'::jsonb)
  ) into res
  from order_facts where created_at >= p_from and created_at < p_to
    and (p_include_test or not is_test);
  return res;
end
$function$;

create or replace function public.report_quality(p_from timestamp with time zone, p_to timestamp with time zone, p_include_test boolean default true)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'orders', (select count(*) from orders o where o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'cancelled', (select count(*) from orders o where o.status = 'cancelled' and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'cancel_reasons', (select coalesce(jsonb_object_agg(cancel_reason, n), '{}'::jsonb) from (select cancel_reason, count(*) n from orders o where o.status = 'cancelled' and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%')) group by cancel_reason) t),
    'refunds', (select count(*) from orders o where o.refund_id is not null and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'refund_cents', (select coalesce(sum(o.refund_cents), 0) from orders o where o.refund_id is not null and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'refunds_failed', (select count(*) from orders o where o.refund_status = 'failed' and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'no_bid_alerts', (select count(*) from ops_alerts a left join orders o on o.id = a.order_id where a.kind = 'no_bid' and a.created_at >= p_from and a.created_at < p_to and (p_include_test or o.id is null or not (o.is_test or o.address like 'FP TEST%'))),
    'payment_failed', (select count(*) from orders o where o.status = 'payment_failed' and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'awaiting_payment', (select count(*) from orders o where o.status = 'awaiting_payment' and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'prep_extensions', (select count(*) from audit_events e join orders o on o.id = e.order_id where e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'orders_extended', (select count(distinct e.order_id) from audit_events e join orders o on o.id = e.order_id where e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'extension_minutes', (select coalesce(sum(e.to_value::int - e.from_value::int), 0) from audit_events e join orders o on o.id = e.order_id where e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'incidents_by_type', (select coalesce(jsonb_object_agg(type, n), '{}'::jsonb) from (select type, count(*) n from incidents i where i.occurred_at >= p_from and i.occurred_at < p_to and (p_include_test or not coalesce(i.is_test, false)) group by type) t),
    'ratings', (select count(*) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'avg_food_rating', (select round(avg(rt.food_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'avg_rider_rating', (select round(avg(rt.rider_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'stacked', (select jsonb_build_object(
        'stacked_ratings', count(*) filter (where o.stacked), 'single_ratings', count(*) filter (where not o.stacked),
        'stacked_avg_food', round(avg(rt.food_stars) filter (where o.stacked), 2), 'single_avg_food', round(avg(rt.food_stars) filter (where not o.stacked), 2),
        'stacked_avg_rider', round(avg(rt.rider_stars) filter (where o.stacked), 2), 'single_avg_rider', round(avg(rt.rider_stars) filter (where not o.stacked), 2))
      from ratings rt join orders o on o.id = rt.order_id where o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
    'by_restaurant', (select coalesce(jsonb_agg(x order by x->>'restaurant'), '[]'::jsonb) from (
        select jsonb_build_object('restaurant', r.name,
          'orders', (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and o.status not in ('awaiting_payment','payment_failed') and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
          'cancelled', (select count(*) from orders o where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and o.status = 'cancelled' and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
          'extensions', (select count(*) from audit_events e join orders o on o.id = e.order_id where o.restaurant_id = r.id and e.type = 'prep_extended' and e.created_at >= p_from and e.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
          'incidents', (select count(*) from incidents i where i.restaurant_id = r.id and i.occurred_at >= p_from and i.occurred_at < p_to and (p_include_test or not coalesce(i.is_test, false))),
          'ratings', (select count(*) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))),
          'rating', (select round(avg(rt.food_stars), 2) from ratings rt join orders o on o.id = rt.order_id where o.restaurant_id = r.id and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%')))) x
        from restaurants r) s)
  ) into res;
  return res;
end
$function$;

create or replace function public.report_safety(p_from timestamp with time zone, p_to timestamp with time zone, p_include_test boolean default true)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare res jsonb;
begin
  perform assert_admin();
  select jsonb_build_object(
    'incidents_open', (select count(*) from incidents i where i.status = 'open' and i.occurred_at >= p_from and i.occurred_at < p_to and (p_include_test or not coalesce(i.is_test, false))),
    'incidents_total', (select count(*) from incidents i where i.occurred_at >= p_from and i.occurred_at < p_to and (p_include_test or not coalesce(i.is_test, false))),
    'by_severity', (select coalesce(jsonb_object_agg(severity, n), '{}'::jsonb) from (select severity, count(*) n from incidents i where i.occurred_at >= p_from and i.occurred_at < p_to and (p_include_test or not coalesce(i.is_test, false)) group by severity) t),
    'suspensions', (select count(*) from audit_events e
                    where e.type = 'account_status' and e.to_value = 'suspended' and e.created_at >= p_from and e.created_at < p_to
                      and (p_include_test or not exists (select 1 from profiles p where p.id = e.profile_id and p.is_test))),
    'currently_suspended_riders', (select count(*) from profiles where role = 'rider' and status = 'suspended' and (p_include_test or not is_test)),
    'late_night_deliveries', (select count(*) from order_facts f where f.status = 'delivered' and f.late_night and f.delivered_at >= p_from and f.delivered_at < p_to and (p_include_test or not f.is_test))
  ) into res;
  return res;
end
$function$;

grant execute on function public.report_payments(timestamp with time zone, timestamp with time zone, boolean) to authenticated, service_role;
grant execute on function public.report_delivery(timestamp with time zone, timestamp with time zone, boolean) to authenticated, service_role;
grant execute on function public.report_quality(timestamp with time zone, timestamp with time zone, boolean) to authenticated, service_role;
grant execute on function public.report_safety(timestamp with time zone, timestamp with time zone, boolean) to authenticated, service_role;
revoke execute on function public.report_payments(timestamp with time zone, timestamp with time zone, boolean) from anon, public;
revoke execute on function public.report_delivery(timestamp with time zone, timestamp with time zone, boolean) from anon, public;
revoke execute on function public.report_quality(timestamp with time zone, timestamp with time zone, boolean) from anon, public;
revoke execute on function public.report_safety(timestamp with time zone, timestamp with time zone, boolean) from anon, public;

-- ---------------------------------------------------------------------------
-- Grants: drop unused anon privileges (RLS already blocked these)
-- ---------------------------------------------------------------------------
revoke all on table public.account_status_log from anon, public;
revoke all on table public.customer_credit from anon, public;
revoke all on table public.promo_codes from anon, public;
revoke all on table public.referral_codes from anon, public;

-- View is security_invoker; writes should not go through it. Keep SELECT for the legal pages.
revoke insert, update, delete, truncate, references, trigger on table public.legal_templates_current from anon, authenticated, public;
grant select on table public.legal_templates_current to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Optional: record v34 in migration history if the live project still lacks it.
-- The token UPDATE was already applied out of band (0 remaining NULLs at review).
-- On a fresh database the original 20261024190000 file still runs first (idempotent).
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    return;
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261024190000') then
    return;
  end if;
  if to_regclass('auth.users') is not null then
    if exists (
      select 1 from auth.users
      where confirmation_token is null or recovery_token is null or email_change_token_new is null
         or email_change is null or email_change_token_current is null or phone_change is null
         or phone_change_token is null or reauthentication_token is null
    ) then
      raise exception 'v34 token columns still contain NULLs; refusing to record a no-op history row';
    end if;
  end if;
  insert into supabase_migrations.schema_migrations (version, name)
  values ('20261024190000', 'v34_auth_null_tokens');
end
$$;
