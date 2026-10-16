-- v24: enforce the 2-year retention of account status decisions promised in deactivation_appeal (section 5).
create or replace function public.fp_purge_status_log() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from account_status_log where created_at < now() - interval '2 years';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.fp_purge_status_log() from public, anon, authenticated;
grant execute on function public.fp_purge_status_log() to service_role;
select cron.schedule('fp-purge-status-log', '35 3 * * *', $$select public.fp_purge_status_log()$$);
