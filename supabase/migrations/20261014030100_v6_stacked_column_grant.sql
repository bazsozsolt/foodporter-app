-- the orders table uses column-level SELECT grants (phone excluded), so new columns need an explicit grant
grant select (stacked) on public.orders to authenticated;
