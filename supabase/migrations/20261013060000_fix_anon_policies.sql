-- Fix: after revoking EXECUTE on my_role()/my_restaurant() from anon, any policy that calls them
-- made signed-out reads fail ("permission denied for function my_role"), e.g. the restaurant list.
-- Policies that use the helpers now apply to signed-in users only; public catalog reads don't use them.

alter policy "admin bids" on bids to authenticated;
alter policy "bids visible" on bids to authenticated;
alter policy "riders bid" on bids to authenticated;
alter policy "admin earnings" on earnings to authenticated;
alter policy "rider sees own earnings" on earnings to authenticated;
alter policy "restaurant manages menu" on menu_items to authenticated;
alter policy "admin orders" on orders to authenticated;
alter policy "orders visible to parties" on orders to authenticated;
alter policy "restaurant updates own orders" on orders to authenticated;
alter policy "rider updates assigned orders" on orders to authenticated;
alter policy "customer creates order" on orders to authenticated;
alter policy "admin payouts" on payouts to authenticated;
alter policy "rider sees own payouts" on payouts to authenticated;
alter policy "admin profiles" on profiles to authenticated;
alter policy "own profile read" on profiles to authenticated;
alter policy "own profile update" on profiles to authenticated;
alter policy "admin restaurants" on restaurants to authenticated;
alter policy "order items visible with order" on order_items to authenticated;
alter policy "customer adds items" on order_items to authenticated;

-- Everyone (incl. signed-out visitors) can browse active restaurants; admins also see inactive ones via "admin restaurants".
drop policy if exists "public restaurants" on restaurants;
create policy "public restaurants" on restaurants for select to anon, authenticated using (active);
