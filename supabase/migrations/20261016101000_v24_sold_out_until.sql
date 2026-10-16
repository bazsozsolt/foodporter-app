-- v24: "sold out until tomorrow". The restaurant marks a dish unavailable with an end time; a cron puts it back.
alter table menu_items add column if not exists sold_out_until timestamptz;
create or replace function public.fp_restore_sold_out() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update menu_items set available = true, sold_out_until = null where not available and sold_out_until is not null and sold_out_until <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fp_restore_sold_out() from public, anon, authenticated;
grant execute on function public.fp_restore_sold_out() to service_role;
select cron.schedule('fp-restore-sold-out', '*/5 * * * *', $$select public.fp_restore_sold_out()$$);
