-- v26: which distance sets the delivery-fee band: restaurant -> customer (trip, default) or zone centre -> customer.
alter table public.settings add column if not exists fee_distance_basis text not null default 'restaurant'
  check (fee_distance_basis in ('restaurant', 'centre'));
alter table public.orders add column if not exists fee_km numeric(5,2);
-- protect fee_km like the other server-set fields
create or replace function public.fp_guard_fee_km() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if tg_op = 'INSERT' then new.fee_km := null;
    elsif new.fee_km is distinct from old.fee_km then raise exception 'not allowed to change these order fields'; end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_fee_km on public.orders;
create trigger orders_guard_fee_km before insert or update on public.orders for each row execute function fp_guard_fee_km();
