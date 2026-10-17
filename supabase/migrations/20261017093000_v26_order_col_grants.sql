-- v26: orders uses column-level SELECT grants (phone stays hidden). Expose the new per-order commission rate and fee distance
-- to signed-in users (rows still limited by RLS; commission_cents was already readable, rates are public in the partner terms).
grant select (commission_pct, fee_km) on public.orders to authenticated;
