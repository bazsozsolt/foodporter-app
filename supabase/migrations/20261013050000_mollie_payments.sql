-- Food Porter: Mollie payments. Orders start unpaid; only the mollie-webhook (service role) marks them 'placed'.
alter table orders add column if not exists paid_at timestamptz;
alter table orders add column if not exists payment_status text;     -- raw Mollie status (open/paid/failed/expired/canceled)
alter table orders alter column status set default 'awaiting_payment';
create index if not exists orders_mollie_payment_id_idx on orders(mollie_payment_id);

-- Customers can only create unpaid orders
drop policy if exists "customer creates order" on orders;
create policy "customer creates order" on orders for insert
  with check (customer_id = auth.uid() and status = 'awaiting_payment');

-- Order items may be added while the order is still unpaid
drop policy if exists "customer adds items" on order_items;
create policy "customer adds items" on order_items for insert
  with check (exists (select 1 from orders o where o.id = order_id and o.customer_id = auth.uid() and o.status = 'awaiting_payment'));

-- Restaurants (and the rider feed) never see unpaid orders
drop policy if exists "orders visible to parties" on orders;
create policy "orders visible to parties" on orders for select using (
  customer_id = auth.uid()
  or (restaurant_id = my_restaurant() and status not in ('awaiting_payment', 'payment_failed'))
  or rider_id = auth.uid()
  or (my_role() = 'rider' and status = 'accepted')
  or my_role() = 'admin');

drop policy if exists "restaurant updates own orders" on orders;
create policy "restaurant updates own orders" on orders for update
  using (restaurant_id = my_restaurant() and status not in ('awaiting_payment', 'payment_failed'));

-- Non-admin users may not flip payment fields or move an order out of the unpaid states
create or replace function guard_order_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.customer_id is distinct from old.customer_id
      or new.restaurant_id is distinct from old.restaurant_id
      or new.rider_id is distinct from old.rider_id
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.delivery_fee_cents is distinct from old.delivery_fee_cents
      or new.commission_cents is distinct from old.commission_cents
      or new.mollie_payment_id is distinct from old.mollie_payment_id
      or new.paid_at is distinct from old.paid_at
      or new.payment_status is distinct from old.payment_status
      or old.status in ('awaiting_payment', 'payment_failed') then
      raise exception 'not allowed to change these order fields';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_order_update() from public, anon, authenticated;
