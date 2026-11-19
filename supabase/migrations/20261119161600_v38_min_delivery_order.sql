-- v38: platform minimum for delivery orders. Default €15.00, admin-editable on settings.
-- The minimum is the food item subtotal (orders.subtotal_cents), before delivery fee, service fee,
-- tip, promo discounts and credit — the same basis as restaurants.min_order_cents and promo
-- "aan gerechten". Pickup (afhalen) is exempt. 1043/1046 are already placed and are not rewritten.
-- The trigger only runs when an order becomes 'placed', so existing paid rows stay untouched.
-- create-payment also checks before a Mollie payment is created.

alter table public.settings
  add column if not exists min_delivery_order_cents int not null default 1500;

alter table public.settings drop constraint if exists settings_min_delivery_order_check;
alter table public.settings
  add constraint settings_min_delivery_order_check
  check (min_delivery_order_cents between 0 and 10000);

comment on column public.settings.min_delivery_order_cents is
  'Minimum food subtotal in cents for delivery orders, before fees and discounts. Pickup is exempt. Default 1500 (€15).';

create or replace function public.fp_delivery_min_violation(p_fulfilment text, p_subtotal int)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare v_min int;
begin
  if coalesce(p_fulfilment, 'delivery') is distinct from 'delivery' then
    return null;
  end if;
  select min_delivery_order_cents into v_min from public.settings limit 1;
  v_min := coalesce(v_min, 0);
  if coalesce(p_subtotal, 0) >= v_min then
    return null;
  end if;
  return jsonb_build_object('min_cents', v_min, 'shortfall_cents', v_min - coalesce(p_subtotal, 0));
end $$;

revoke all on function public.fp_delivery_min_violation(text, int) from public, anon, authenticated;
grant execute on function public.fp_delivery_min_violation(text, int) to service_role;

create or replace function public.fp_guard_min_delivery_order()
returns trigger
language plpgsql
set search_path = public
as $$
declare v jsonb;
begin
  if new.status = 'placed'
     and (tg_op = 'INSERT'
          or old.status is distinct from 'placed'
          or new.subtotal_cents is distinct from old.subtotal_cents
          or new.fulfilment is distinct from old.fulfilment) then
    v := public.fp_delivery_min_violation(new.fulfilment, new.subtotal_cents);
    if v is not null then
      raise exception 'Delivery orders need a food subtotal of at least €% (before fees and discounts).',
        to_char((v->>'min_cents')::int / 100.0, 'FM999990.00');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_min_delivery_order on public.orders;
create trigger orders_min_delivery_order
  before insert or update of status, subtotal_cents, fulfilment on public.orders
  for each row
  execute function public.fp_guard_min_delivery_order();
