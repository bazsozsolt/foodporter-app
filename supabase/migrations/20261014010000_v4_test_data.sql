-- v4: test-data flags, OSM-imported test restaurants, one-call purge.
alter table restaurants add column if not exists is_test boolean not null default false,
  add column if not exists description text, add column if not exists osm_ref text;
alter table profiles  add column if not exists is_test boolean not null default false;
alter table orders    add column if not exists is_test boolean not null default false;
alter table incidents add column if not exists is_test boolean not null default false;
alter table payouts   add column if not exists is_test boolean not null default false;
create index if not exists orders_is_test_idx on orders(is_test) where is_test;

create or replace view order_facts with (security_invoker = true) as
SELECT o.id, o.created_at, o.status, o.restaurant_id, r.name AS restaurant_name, o.rider_id, o.customer_id,
    o.subtotal_cents, o.delivery_fee_cents, COALESCE(r.commission_pct, 12::numeric) AS commission_pct,
    round(o.subtotal_cents::numeric * COALESCE(r.commission_pct, 12::numeric) / 100.0)::integer AS commission_cents,
    o.prep_minutes, o.accepted_at, o.ready_at, o.delivered_at, o.paid_at, o.restaurant_payout_id,
    COALESCE(o.assigned_at, b.created_at) AS bid_at, b.eta_minutes, b.rider_name,
    EXTRACT(epoch FROM COALESCE(o.assigned_at, b.created_at) - o.accepted_at)::integer AS bid_seconds,
    (COALESCE(o.assigned_at, b.created_at) - o.accepted_at) <= '00:03:00'::interval AS fast_bid,
    o.delivered_at <= (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes)) AS on_time,
    CASE WHEN o.delivered_at IS NOT NULL AND b.created_at IS NOT NULL
      THEN EXTRACT(epoch FROM o.delivered_at - (COALESCE(o.assigned_at, b.created_at) + make_interval(mins => b.eta_minutes)))::integer / 60 ELSE NULL::integer END AS minutes_late,
    CASE WHEN o.status = ANY (ARRAY['ready'::order_status, 'picked_up'::order_status, 'delivered'::order_status]) AND o.accepted_at IS NOT NULL AND o.ready_at IS NOT NULL
      THEN round(EXTRACT(epoch FROM o.ready_at - o.accepted_at) / 60.0, 1) ELSE NULL::numeric END AS actual_prep_minutes,
    (SELECT count(*) FROM audit_events e WHERE e.order_id = o.id AND e.type = 'prep_extended')::integer AS prep_extensions,
    o.status <> ALL (ARRAY['awaiting_payment'::order_status, 'payment_failed'::order_status, 'cancelled'::order_status]) AS is_paid,
    (o.is_test OR o.address ~~ 'FP TEST%') AS is_test,
    EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') >= 22
      OR EXTRACT(hour FROM COALESCE(o.delivered_at, o.created_at) AT TIME ZONE 'Europe/Amsterdam') < 6 AS late_night,
    rt.food_stars, rt.rider_stars, o.cancel_reason, o.refund_status, o.refund_cents, o.distance_km
FROM orders o
LEFT JOIN restaurants r ON r.id = o.restaurant_id
LEFT JOIN bids b ON b.order_id = o.id AND b.accepted
LEFT JOIN ratings rt ON rt.order_id = o.id;

-- Removes every row flagged is_test (and everything hanging off it), incl. the test auth users.
-- Run as the database owner:  select public.purge_test_data();   (or as an admin via RPC)
create or replace function purge_test_data() returns jsonb language plpgsql security definer set search_path = public as $$
declare o bigint[]; u uuid[]; r uuid[]; n jsonb;
begin
  if current_user in ('authenticated', 'anon') or (auth.uid() is not null and coalesce(my_role()::text, '') <> 'admin') then
    raise exception 'admin only';
  end if;
  o := array(select id from orders where is_test);
  u := array(select id from profiles where is_test);
  r := array(select id from restaurants where is_test);
  if 1043 = any(o) or 1046 = any(o) then raise exception 'refusing: real order flagged as test'; end if;
  -- orders of test restaurants / test customers are test data too
  o := o || array(select id from orders where (restaurant_id = any(r) or customer_id = any(u)) and not (id = any(o)));
  n := jsonb_build_object('orders', cardinality(o), 'profiles', cardinality(u), 'restaurants', cardinality(r));
  delete from rider_locations where order_id = any(o) or rider_id = any(u);
  delete from ratings where order_id = any(o);
  delete from earnings where order_id = any(o) or rider_id = any(u);
  delete from incidents where is_test or order_id = any(o) or rider_id = any(u) or restaurant_id = any(r);
  delete from ops_alerts where order_id = any(o);
  delete from audit_events where order_id = any(o) or profile_id = any(u) or actor = any(u);
  delete from bids where order_id = any(o) or rider_id = any(u);
  delete from order_items where order_id = any(o);
  delete from orders where id = any(o);
  delete from payouts where is_test or rider_id = any(u) or restaurant_id = any(r);
  delete from menu_items where restaurant_id = any(r);
  update profiles set restaurant_id = null where restaurant_id = any(r) and not is_test;
  delete from profiles where id = any(u);
  delete from auth.users where id = any(u);
  delete from restaurants where id = any(r);
  update restaurants set rating_avg = (select round(avg(food_stars),2) from ratings rt join orders x on x.id = rt.order_id where x.restaurant_id = restaurants.id),
    rating_count = (select count(*) from ratings rt join orders x on x.id = rt.order_id where x.restaurant_id = restaurants.id);
  return n;
end $$;
revoke execute on function public.purge_test_data() from public, anon;
grant execute on function public.purge_test_data() to authenticated;
