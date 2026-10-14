-- v8: the pilot's single number, tracked per day, per restaurant and per rider (spec: "Tracked per day, per restaurant, per rider").
-- Key metric = share of PAID orders that got an accepted rider bid within 3 minutes of the restaurant accepting AND were
-- delivered on or before the bid ETA. Unlike report_delivery's is_paid, orders that were paid and later cancelled
-- (e.g. no bid in 10 min, restaurant timeout) stay in the denominator: they are exactly the failures the pilot must see.
create or replace function report_key_metric(p_from timestamptz, p_to timestamptz, p_include_test boolean default true) returns jsonb
language plpgsql stable set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  with f as (
    select f.*, (f.fast_bid is true and f.on_time is true) as hit,
           (o.paid_at is not null) as was_paid,
           (f.created_at at time zone 'Europe/Amsterdam')::date as day
    from order_facts f join orders o on o.id = f.id
    where f.created_at >= p_from and f.created_at < p_to and (p_include_test or not f.is_test)
  ), p as (select * from f where was_paid)
  select jsonb_build_object(
    'target_pct', 80,
    'paid', (select count(*) from p),
    'hits', (select count(*) from p where hit),
    'pct', (select round(100.0 * count(*) filter (where hit) / nullif(count(*), 0), 1) from p),
    'pct_fast_bid', (select round(100.0 * count(*) filter (where fast_bid) / nullif(count(*), 0), 1) from p),
    'pct_on_time', (select round(100.0 * count(*) filter (where on_time) / nullif(count(*) filter (where status = 'delivered'), 0), 1) from p),
    'no_bid', (select count(*) from p where bid_at is null),
    'cancelled_after_payment', (select count(*) from p where status = 'cancelled'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'paid', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1)) order by day)
       from (select day, count(*) n, count(*) filter (where hit) h from p group by day) d), '[]'::jsonb),
    'by_restaurant', coalesce((select jsonb_agg(jsonb_build_object('restaurant', restaurant_name, 'paid', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1), 'avg_bid_seconds', s) order by n desc, restaurant_name)
       from (select restaurant_name, count(*) n, count(*) filter (where hit) h, round(avg(bid_seconds)) s from p group by restaurant_name) d), '[]'::jsonb),
    'by_rider', coalesce((select jsonb_agg(jsonb_build_object('rider', coalesce(rider_name, '—'), 'jobs', n, 'hits', h, 'pct', round(100.0 * h / nullif(n, 0), 1), 'on_time', ot) order by n desc)
       from (select rider_name, count(*) n, count(*) filter (where hit) h, count(*) filter (where on_time) ot from p where rider_id is not null group by rider_name) d), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke execute on function public.report_key_metric(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.report_key_metric(timestamptz, timestamptz, boolean) to authenticated;
