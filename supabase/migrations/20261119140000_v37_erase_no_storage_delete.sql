-- v37: do not issue a direct delete against storage.objects during account erasure.
-- v36's cleanup hit Supabase's statement-level protect_objects_delete trigger
-- ("Direct deletion from storage tables is not allowed. Use the Storage API instead."),
-- so every auth-user delete rolled back. Expired delivery-proof and support files are
-- still removed by the existing nightly purge-retention edge function, which uses the
-- Storage API (storage.from(...).remove). This function only clears order photo paths
-- and detaches storage.objects owner/metadata via UPDATE (not blocked). It does not
-- set storage.allow_delete_query. Everything else from v36 is unchanged.

create or replace function public.fp_cleanup_deleted_user(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_email text;
  v_phone text;
  v_iban text;
  v_digits text;
  v_extra text[];
  v_tokens text[] := array[]::text[];
  v_old_photos text[] := array[]::text[];
begin
  if p_id is null then return; end if;
  if exists (select 1 from public.orders where id in (1043, 1046) and (customer_id = p_id or rider_id = p_id)) then
    raise exception 'protected account';
  end if;
  if exists (
    select 1 from public.orders
    where (customer_id = p_id or rider_id = p_id)
      and status in ('placed', 'accepted', 'assigned', 'ready', 'picked_up')
  ) then
    raise exception 'profile has an active order; finish it first';
  end if;

  perform 1 from public.profiles where id = p_id for update;
  select full_name, email, phone, iban into v_name, v_email, v_phone, v_iban
  from public.profiles where id = p_id;

  if v_name is not null then v_tokens := v_tokens || v_name; end if;
  if v_email is not null then v_tokens := v_tokens || v_email; end if;
  if v_phone is not null then v_tokens := v_tokens || v_phone; end if;
  if v_iban is not null then v_tokens := v_tokens || v_iban; end if;
  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  if length(v_digits) >= 8 then v_tokens := v_tokens || v_digits; end if;
  v_digits := regexp_replace(coalesce(v_iban, ''), '\s', '', 'g');
  if length(v_digits) >= 8 then v_tokens := v_tokens || v_digits; end if;

  select coalesce(array_agg(distinct val), '{}') into v_extra
  from (
    select address as val from public.orders
      where customer_id = p_id and id not in (1043, 1046) and address is not null
    union
    select phone from public.orders
      where customer_id = p_id and id not in (1043, 1046) and phone is not null
    union
    select code from public.referral_codes where customer_id = p_id
  ) s;
  v_tokens := v_tokens || coalesce(v_extra, '{}');

  -- Local to this transaction. fp_order_commission and the legal-acceptance trigger read it;
  -- other sessions keep calculating commission.
  perform set_config('fp.erasure', 'on', true);
  perform set_config('fp.proof', 'on', true);

  -- Delivery photos past 30 days go; newer ones stay on the order with the person detached below.
  select coalesce(array_agg(delivery_photo_path), '{}') into v_old_photos
  from public.orders
  where (customer_id = p_id or rider_id = p_id)
    and id not in (1043, 1046)
    and delivery_photo_path is not null
    and coalesce(delivery_photo_at, delivered_at, created_at) < now() - interval '30 days';

  -- Do not issue a direct storage.objects delete: protect_objects_delete forbids it.
  -- Clear the path on the order so the person is detached. The nightly purge-retention
  -- edge function removes the file through the Storage API (fp_expired_proofs uses
  -- storage.objects.created_at when the order path is already null).
  if cardinality(v_old_photos) > 0 then
    update public.orders
      set delivery_photo_path = null, delivery_photo_at = null
      where id not in (1043, 1046)
        and delivery_photo_path = any (v_old_photos);
  end if;

  -- Order chat: delete once the order has been finished for 6 months; otherwise detach and scrub.
  delete from public.order_messages m
  using public.orders o
  where m.order_id = o.id
    and o.id not in (1043, 1046)
    and (o.customer_id = p_id or o.rider_id = p_id or m.author_id = p_id)
    and o.status in ('delivered', 'cancelled', 'payment_failed')
    and coalesce(o.delivered_at, o.created_at) < now() - interval '6 months';

  update public.order_messages m
    set author_id = case when m.author_id = p_id then null else m.author_id end,
        body = public.fp_scrub_identity(m.body, v_tokens, 500)
    where m.author_id = p_id
       or m.order_id in (
         select id from public.orders
         where (customer_id = p_id or rider_id = p_id) and id not in (1043, 1046)
       );

  update public.order_items oi
    set guest_name = 'Verwijderde gebruiker'
    from public.orders o
    where oi.order_id = o.id
      and o.id not in (1043, 1046)
      and o.customer_id = p_id
      and oi.guest_name is not null
      and v_name is not null
      and length(btrim(v_name)) >= 3
      and lower(oi.guest_name) = lower(btrim(v_name));

  -- Financial rows stay. Amounts, payment ids and status are not touched.
  update public.orders set
    phone = case when customer_id = p_id then 'verwijderd' else phone end,
    address = case when customer_id = p_id then 'verwijderd' else address end,
    lat = case when customer_id = p_id then null else lat end,
    lng = case when customer_id = p_id then null else lng end,
    cancel_reason = case when customer_id = p_id then public.fp_scrub_identity(cancel_reason, v_tokens, 500) else cancel_reason end,
    referral_code = case
      when customer_id = p_id and referral_code in (select code from public.referral_codes where customer_id = p_id) then null
      else referral_code end,
    customer_id = case when customer_id = p_id then null else customer_id end,
    rider_id = case when rider_id = p_id then null else rider_id end
  where (customer_id = p_id or rider_id = p_id)
    and id not in (1043, 1046);

  update public.earnings set rider_id = null where rider_id = p_id;
  update public.payouts
    set rider_id = null, anonymised = true, reference = public.fp_scrub_identity(reference, v_tokens, 200)
    where rider_id = p_id;
  update public.customer_credit set customer_id = null, reason = 'erased' where customer_id = p_id;
  update public.bids set rider_id = null, rider_name = 'Verwijderde gebruiker' where rider_id = p_id;
  update public.ratings
    set customer_id = null, comment = public.fp_scrub_identity(comment, v_tokens, 500)
    where customer_id = p_id;
  update public.promo_codes set created_by = null where created_by = p_id;

  -- Support: close the privacy request and detach the rest. Tickets already past the
  -- 2-year window are anonymised with the others, not deleted here, so
  -- fp_expired_support_photos can still find photo_path. The nightly purge-retention
  -- edge function removes those files through the Storage API, then deletes the rows.

  update public.support_messages
    set author_id = case when author_id = p_id then null else author_id end,
        body = 'Accountverwijdering afgehandeld. Persoonsgegevens verwijderd.'
    where ticket_id in (select id from public.support_tickets where created_by = p_id and category = 'privacy');
  update public.support_tickets set
    status = 'resolved',
    resolved_at = coalesce(resolved_at, now()),
    created_by = null,
    assigned_to = case when assigned_to = p_id then null else assigned_to end,
    subject = 'Accountverwijdering afgehandeld',
    lat = null,
    lng = null
  where created_by = p_id and category = 'privacy';

  update public.support_messages
    set author_id = case when author_id = p_id then null else author_id end,
        body = public.fp_scrub_identity(body, v_tokens, 2000)
    where author_id = p_id
       or ticket_id in (select id from public.support_tickets where created_by = p_id);
  update public.support_tickets set
    created_by = null,
    assigned_to = case when assigned_to = p_id then null else assigned_to end,
    subject = public.fp_scrub_identity(subject, v_tokens, 140),
    lat = null,
    lng = null
  where created_by = p_id;

  delete from public.account_status_log
    where profile_id = p_id and created_at < now() - interval '2 years';
  update public.account_status_log set
    profile_id = case when profile_id = p_id then null else profile_id end,
    actor_id = case when actor_id = p_id then null else actor_id end,
    reason = public.fp_scrub_identity(reason, v_tokens, 500)
  where profile_id = p_id or actor_id = p_id;

  update public.feedback
    set user_id = null, email = null, user_agent = null,
        message = public.fp_scrub_identity(message, v_tokens, 2000)
    where user_id = p_id or (v_email is not null and lower(email) = lower(v_email));
  update public.incidents set
    rider_id = case when rider_id = p_id then null else rider_id end,
    created_by = case when created_by = p_id then null else created_by end,
    description = public.fp_scrub_identity(description, v_tokens, 2000)
  where rider_id = p_id or created_by = p_id;
  update public.call_audit set caller_id = null where caller_id = p_id;
  update public.ops_alerts
    set message = public.fp_scrub_identity(message, v_tokens, 2000)
    where (v_email is not null and length(v_email) >= 5 and position(lower(v_email) in lower(message)) > 0)
       or (v_name is not null and length(btrim(v_name)) >= 3 and position(lower(btrim(v_name)) in lower(message)) > 0)
       or (v_phone is not null and length(v_phone) >= 8 and position(v_phone in message) > 0);

  update public.legal_acceptances
    set profile_id = null, ip = null, user_agent = null
    where profile_id = p_id;

  update public.audit_events set
    profile_id = case when profile_id = p_id then null else profile_id end,
    actor = case when actor = p_id then null else actor end,
    from_value = public.fp_scrub_identity(from_value, v_tokens, 500),
    to_value = public.fp_scrub_identity(to_value, v_tokens, 500)
  where profile_id = p_id or actor = p_id;

  if to_regclass('storage.objects') is not null then
    update storage.objects
      set owner = null, owner_id = null, user_metadata = '{}'::jsonb
      where owner = p_id or owner_id = p_id::text;
  end if;

  update public.rider_documents set verified_by = null where verified_by = p_id;
  update public.rider_onboarding set done_by = null where done_by = p_id;
  update public.legal_requests set sent_by = null where sent_by = p_id;
  update public.rider_shifts set created_by = null where created_by = p_id;

  delete from public.push_subscriptions where profile_id = p_id;
  delete from public.referral_codes where customer_id = p_id;
  delete from public.rate_limits where profile_id = p_id;
  delete from public.rider_locations where rider_id = p_id;
  delete from public.rider_availability where rider_id = p_id;
  delete from public.rider_documents where profile_id = p_id;
  delete from public.rider_onboarding where profile_id = p_id;
  delete from public.rider_hr where profile_id = p_id;
  delete from public.rider_shifts where rider_id = p_id;
  delete from public.work_sessions where rider_id = p_id;
  delete from public.work_violations where rider_id = p_id;
  delete from public.legal_requests where profile_id = p_id;
  delete from public.group_items where user_id = p_id;
  delete from public.group_members where user_id = p_id;
  update public.group_orders set host_id = null where host_id = p_id;

  delete from public.profiles where id = p_id;

  insert into public.audit_events(profile_id, type, from_value, to_value, actor)
  values (null, 'profile_erased', null, 'deleted', auth.uid());
end $$;
