-- v25 audit (MEDIUM, AVG art. 17): self-service erasure request + admin anonymisation.
-- Orders/payments stay 7 years (fiscal duty) but are detached from the person; contact data and device data are removed.
alter table support_tickets drop constraint if exists support_tickets_category_check;
alter table support_tickets add constraint support_tickets_category_check check (category = any (array['late','missing_item','wrong_item','damaged','rider_issue','payment','refund','other','rider_problem','order_problem','help','item_unavailable','address_not_found','customer_unreachable','restaurant_delay','accident','safety','sos','payout','privacy']));

create or replace function public.fp_request_account_deletion() returns bigint
language plpgsql security definer set search_path = public as $$
declare me profiles; tid bigint;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'not signed in'; end if;
  select id into tid from support_tickets where created_by = me.id and category = 'privacy' and status <> 'resolved' limit 1;
  if tid is not null then return tid; end if; -- one open request is enough
  insert into support_tickets(created_by, role, category, priority, subject, sla_due_at, is_test)
    values (me.id, case when me.role::text in ('rider','restaurant') then me.role::text else 'customer' end, 'privacy', 'high',
            'Verzoek accountverwijdering (AVG art. 17)', now() + interval '30 days', coalesce(me.is_test, false))
    returning id into tid;
  insert into support_messages(ticket_id, author_id, author_role, body)
    values (tid, me.id, case when me.role::text in ('rider','restaurant') then me.role::text else 'customer' end,
            'Ik wil dat mijn account en persoonsgegevens worden verwijderd. / Please delete my account and personal data.');
  return tid;
end $$;
revoke execute on function public.fp_request_account_deletion() from public, anon;
grant execute on function public.fp_request_account_deletion() to authenticated;

create or replace function public.fp_anonymise_profile(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_push int; n_loc int;
begin
  perform assert_admin();
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
  insert into audit_events(profile_id, type, from_value, to_value, actor) values (p_id, 'profile_erased', null, 'anonymised', auth.uid());
  return jsonb_build_object('push', n_push, 'locations', n_loc);
end $$;
revoke execute on function public.fp_anonymise_profile(uuid) from public, anon;
grant execute on function public.fp_anonymise_profile(uuid) to authenticated;
