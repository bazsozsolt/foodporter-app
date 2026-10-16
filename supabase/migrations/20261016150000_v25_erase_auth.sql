-- v25: admin erasure also deletes the Supabase Auth login.
-- profiles.id used to cascade from auth.users, which would remove the profile and fail on
-- the orders/earnings/payouts FKs. Keep the anonymised profile row for financial records.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.fp_erase_account(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_role text;
begin
  perform assert_admin();
  if p_id is null then raise exception 'profile required'; end if;
  if exists (select 1 from orders where id in (1043, 1046) and (customer_id = p_id or rider_id = p_id)) then
    raise exception 'protected account';
  end if;
  select role into v_role from profiles where id = p_id;
  if v_role is null then raise exception 'profile not found'; end if;
  if v_role = 'admin' then raise exception 'admins cannot be erased here'; end if;
  if p_id = auth.uid() then raise exception 'cannot erase yourself'; end if;
  perform fp_anonymise_profile(p_id); -- refuses while an order is active
  delete from auth.users where id = p_id;
  insert into audit_events(profile_id, type, from_value, to_value, actor) values (p_id, 'auth_user_deleted', null, 'deleted', auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fp_erase_account(uuid) from public, anon;
grant execute on function public.fp_erase_account(uuid) to authenticated;
