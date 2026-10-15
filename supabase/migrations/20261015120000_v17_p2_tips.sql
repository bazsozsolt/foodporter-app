-- v17 P2: tips. Set server-side by create-payment (0..€20), paid via Mollie, 100% to the rider.
alter table orders add column if not exists tip_cents int not null default 0 check (tip_cents between 0 and 2000);
alter table earnings add column if not exists tip_cents int not null default 0 check (tip_cents >= 0);

-- customers must not change the tip directly (only create-payment, with the service role)
create or replace function public.fp_guard_tip() returns trigger language plpgsql as $$
begin
  if new.tip_cents is distinct from old.tip_cents and auth.uid() is not null and coalesce(my_role()::text, '') <> 'admin' then
    raise exception 'tip can only be set at payment';
  end if; return new;
end $$;
drop trigger if exists orders_guard_tip on orders;
create trigger orders_guard_tip before update of tip_cents on orders for each row execute function fp_guard_tip();

create or replace function public.credit_rider_on_delivery() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.rider_id is not null then
    insert into earnings (rider_id, order_id, amount_cents, tip_cents)
    values (new.rider_id, new.id, new.delivery_fee_cents + coalesce(new.tip_cents, 0), coalesce(new.tip_cents, 0))
    on conflict (order_id) do nothing;
  end if;
  return new;
end $function$;

create or replace function public.report_payments(p_from timestamptz, p_to timestamptz) returns jsonb language plpgsql stable set search_path to 'public' as $function$
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
        'tip_cents', coalesce(sum(e.tip_cents), 0),
        'paid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is not null), 0),
        'unpaid_cents', coalesce(sum(e.amount_cents) filter (where e.payout_id is null), 0)) x
      from profiles p
      join earnings e on e.rider_id = p.id and e.earned_at >= p_from and e.earned_at < p_to
      group by p.id, p.full_name, p.email, p.status) s)
  ) into res;
  return res;
end $function$;
