-- v13: e2e helper. Admins can clear rate-limit counters of TEST accounts only (repeated suite runs hit the 6/hour support limit).
create or replace function fp_test_reset_rate_limits() returns integer
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(my_role()::text, '') <> 'admin' then raise exception 'admin only'; end if;
  delete from rate_limits r using profiles p where p.id = r.profile_id and p.is_test; get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function fp_test_reset_rate_limits() from public, anon;
grant execute on function fp_test_reset_rate_limits() to authenticated;
