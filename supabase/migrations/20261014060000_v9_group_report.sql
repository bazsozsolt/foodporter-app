-- v9: admin report on group-order usage (is the feature earning its place?).
create or replace function report_groups(p_from timestamptz, p_to timestamptz, p_include_test boolean default true) returns jsonb
language plpgsql stable set search_path = public as $$
declare res jsonb;
begin
  perform assert_admin();
  with g as (
    select g.*, r.name as restaurant_name,
      (select count(*) from group_members m where m.group_id = g.id) as members,
      (select count(*) from group_items i where i.group_id = g.id) as lines,
      (select coalesce(sum(i.qty * i.price_cents), 0) from group_items i where i.group_id = g.id) as basket_cents,
      o.paid_at, o.subtotal_cents as order_subtotal, o.status as order_status, coalesce(p.is_test, false) as is_test
    from group_orders g join restaurants r on r.id = g.restaurant_id
    left join orders o on o.id = g.order_id
    left join profiles p on p.id = g.host_id
    where g.created_at >= p_from and g.created_at < p_to and (p_include_test or not coalesce(p.is_test, false))
  ), solo as (
    select avg(subtotal_cents) a from orders o where o.group_order_id is null and o.paid_at is not null
      and o.created_at >= p_from and o.created_at < p_to and (p_include_test or not (o.is_test or o.address like 'FP TEST%'))
  )
  select jsonb_build_object(
    'groups', (select count(*) from g),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from g group by status) s), '{}'::jsonb),
    'avg_members', (select round(avg(members), 1) from g),
    'avg_members_paid', (select round(avg(members), 1) from g where paid_at is not null),
    'checked_out', (select count(*) from g where order_id is not null),
    'paid', (select count(*) from g where paid_at is not null),
    'conversion_pct', (select round(100.0 * count(*) filter (where paid_at is not null) / nullif(count(*), 0), 1) from g),
    'avg_basket_cents', (select round(avg(order_subtotal)) from g where paid_at is not null),
    'avg_per_person_cents', (select round(avg(order_subtotal::numeric / nullif(members, 0))) from g where paid_at is not null),
    'avg_solo_basket_cents', (select round(a) from solo),
    'avg_minutes_to_checkout', (select round(avg(extract(epoch from (o.created_at - g.created_at)) / 60.0)::numeric, 1) from g join orders o on o.id = g.order_id),
    'empty_abandoned', (select count(*) from g where lines = 0 and order_id is null),
    'by_restaurant', coalesce((select jsonb_agg(x order by (x->>'groups')::int desc) from (select jsonb_build_object('restaurant', restaurant_name, 'groups', count(*),
        'paid', count(*) filter (where paid_at is not null), 'avg_members', round(avg(members), 1), 'avg_basket_cents', round(avg(order_subtotal) filter (where paid_at is not null))) x
      from g group by restaurant_name) t), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke execute on function public.report_groups(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.report_groups(timestamptz, timestamptz, boolean) to authenticated;
