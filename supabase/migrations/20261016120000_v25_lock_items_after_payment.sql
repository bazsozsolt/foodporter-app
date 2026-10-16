-- v25 audit (HIGH): a customer could add order lines after create-payment had fixed the Mollie amount, so the
-- restaurant would see (and the subtotal would show) more food than was paid. Lines are now locked once a payment exists.
create or replace function public.sanitize_order_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare m menu_items; o orders;
begin
  if coalesce(auth.role(), '') = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    select * into o from orders where id = new.order_id;
    if o.mollie_payment_id is not null or o.status <> 'awaiting_payment' then raise exception 'order is locked for payment'; end if;
    select * into m from menu_items where id = new.menu_item_id;
    if m.id is null or m.restaurant_id is distinct from o.restaurant_id or not m.available then raise exception 'item not on this menu'; end if;
    if new.qty > 50 then raise exception 'quantity too large'; end if;
    new.name := m.name; new.price_cents := m.price_cents;
    -- keep the order's food subtotal consistent with the (server-priced) lines
    update orders set subtotal_cents = new.qty * new.price_cents + coalesce((select sum(qty * price_cents) from order_items where order_id = new.order_id), 0)
      where id = new.order_id;
  end if;
  return new;
end $$;
