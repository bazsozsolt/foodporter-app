-- orders uses column-level grants: let signed-in users read the tip (row RLS still applies)
grant select (tip_cents, service_fee_cents) on orders to authenticated;
