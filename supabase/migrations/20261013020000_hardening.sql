-- Food Porter: security hardening (from Supabase advisors + E2E test review)

-- 1) Nobody should call trigger functions via the API
revoke execute on function public.credit_rider_on_delivery() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 2) Helpers + bid RPC: signed-in users only (RLS policies need my_role/my_restaurant)
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.my_restaurant() from public, anon;
revoke execute on function public.accept_bid(uuid) from public, anon;
grant execute on function public.my_role(), public.my_restaurant(), public.accept_bid(uuid) to authenticated;

-- 3) Riders/restaurants may update order status fields, but not money or ownership columns
create or replace function guard_order_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.customer_id is distinct from old.customer_id
      or new.restaurant_id is distinct from old.restaurant_id
      or new.rider_id is distinct from old.rider_id
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.delivery_fee_cents is distinct from old.delivery_fee_cents
      or new.commission_cents is distinct from old.commission_cents
      or new.mollie_payment_id is distinct from old.mollie_payment_id then
      raise exception 'not allowed to change these order fields';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_update on orders;
create trigger orders_guard_update before update on orders for each row execute function guard_order_update();
revoke execute on function public.guard_order_update() from public, anon, authenticated;
