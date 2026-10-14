-- Admin-only view of what was pushed for an order (used by tests and order detail).
create or replace function public.push_log_for_order(p_order bigint) returns setof push_log
language sql stable security definer set search_path to 'public' as $$
  select * from push_log where order_id = p_order and my_role() = 'admin' order by created_at $$;
revoke all on function public.push_log_for_order(bigint) from public, anon;
grant execute on function public.push_log_for_order(bigint) to authenticated;
