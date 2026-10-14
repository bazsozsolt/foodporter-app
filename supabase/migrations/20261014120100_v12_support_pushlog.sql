-- Admin-only lookup of a push log entry by key (tests + debugging support pushes).
create or replace function public.push_log_by_key(p_key text) returns setof push_log
language sql stable security definer set search_path to 'public' as $$ select * from push_log where event_key = p_key and my_role() = 'admin' $$;
revoke all on function public.push_log_by_key(text) from public, anon;
grant execute on function public.push_log_by_key(text) to authenticated;
