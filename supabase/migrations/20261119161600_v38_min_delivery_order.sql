-- v38: platform minimum for delivery orders. Default €15.00, admin-editable on settings.
-- The minimum is the food total after promo discount and applied credit:
--   greatest(0, subtotal_cents - discount_cents - credit_cents)
-- Delivery fee, service fee and tip are excluded. Pickup (afhalen) is exempt.
-- restaurants.min_order_cents is unchanged: it still uses the item subtotal before discounts.
-- 1043/1046 are already placed and are not rewritten. The trigger only runs when an order
-- becomes 'placed' or when a placed delivery's subtotal, discount, credit or fulfilment changes.
-- create-payment also checks after the quoted discount and credit are applied, before Mollie.

alter table public.settings
  add column if not exists min_delivery_order_cents int not null default 1500;

alter table public.settings drop constraint if exists settings_min_delivery_order_check;
alter table public.settings
  add constraint settings_min_delivery_order_check
  check (min_delivery_order_cents between 0 and 10000);

comment on column public.settings.min_delivery_order_cents is
  'Minimum food total in cents for delivery orders, after promo discount and credit, excluding fees and tip. Pickup is exempt. Default 1500 (€15).';

drop function if exists public.fp_delivery_min_violation(text, int);
drop function if exists public.fp_delivery_min_violation(text, int, int, int);

create or replace function public.fp_delivery_min_violation(p_fulfilment text, p_subtotal int, p_discount int default 0, p_credit int default 0)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_min int;
  v_food int;
begin
  if coalesce(p_fulfilment, 'delivery') is distinct from 'delivery' then
    return null;
  end if;
  select min_delivery_order_cents into v_min from public.settings limit 1;
  v_min := coalesce(v_min, 0);
  v_food := greatest(0, coalesce(p_subtotal, 0) - greatest(0, coalesce(p_discount, 0)) - greatest(0, coalesce(p_credit, 0)));
  if v_food >= v_min then
    return null;
  end if;
  return jsonb_build_object('min_cents', v_min, 'shortfall_cents', v_min - v_food, 'food_cents', v_food);
end $$;

revoke all on function public.fp_delivery_min_violation(text, int, int, int) from public, anon, authenticated;
grant execute on function public.fp_delivery_min_violation(text, int, int, int) to service_role;

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
          or new.discount_cents is distinct from old.discount_cents
          or new.credit_cents is distinct from old.credit_cents
          or new.fulfilment is distinct from old.fulfilment) then
    v := public.fp_delivery_min_violation(new.fulfilment, new.subtotal_cents, new.discount_cents, new.credit_cents);
    if v is not null then
      raise exception 'Delivery orders need a food total of at least €% after discount and credit (before fees).',
        to_char((v->>'min_cents')::int / 100.0, 'FM999990.00');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_min_delivery_order on public.orders;
create trigger orders_min_delivery_order
  before insert or update of status, subtotal_cents, discount_cents, credit_cents, fulfilment on public.orders
  for each row
  execute function public.fp_guard_min_delivery_order();
