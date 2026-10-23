-- v29: erasure also scrubs + locks the login (auth.users), ends all sessions.
create or replace function public.fp_anonymise_profile(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_push int; n_loc int;
begin
  perform assert_admin();
  if p_id = auth.uid() then raise exception 'admins cannot erase their own account here'; end if;
  if exists (select 1 from orders where (customer_id = p_id or rider_id = p_id) and status in ('placed','accepted','assigned','ready','picked_up')) then
    raise exception 'profile has an active order; finish it first';
  end if;
  update profiles set full_name = 'Verwijderde gebruiker', phone = null, iban = null, email = null, online = false, location_consent_at = null,
    status_reason = 'erased (AVG art. 17)' where id = p_id;
  update orders set phone = 'verwijderd' where customer_id = p_id;
  delete from push_subscriptions where profile_id = p_id; get diagnostics n_push = row_count;
  delete from rider_locations where rider_id = p_id; get diagnostics n_loc = row_count;
  delete from rider_availability where rider_id = p_id;
  delete from referral_codes where customer_id = p_id;
  -- login: remove email/phone/metadata, block sign-in, revoke sessions
  update auth.users set email = 'erased-' || p_id || '@invalid.foodporter', phone = null, raw_user_meta_data = '{}'::jsonb,
    encrypted_password = '', banned_until = 'infinity', email_change = '', email_change_token_new = '', recovery_token = '' where id = p_id;
  update auth.identities set identity_data = jsonb_build_object('sub', p_id::text) where user_id = p_id;
  delete from auth.sessions where user_id = p_id;
  insert into audit_events(profile_id, type, from_value, to_value, actor) values (p_id, 'profile_erased', null, 'anonymised+login_locked', auth.uid());
  return jsonb_build_object('push', n_push, 'locations', n_loc);
end $$;
revoke execute on function public.fp_anonymise_profile(uuid) from public, anon;
grant execute on function public.fp_anonymise_profile(uuid) to authenticated;
