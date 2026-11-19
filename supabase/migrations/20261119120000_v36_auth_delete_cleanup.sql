-- v36 (QA v35 bug 6): deleting an auth user must not leave the profile or an open privacy ticket.
-- The same cleanup runs for the admin erase RPCs and for a direct delete of auth.users.
--
-- Removed: the profile and other personal rows (push subscriptions, referral code, rate limits,
--   favourites are device-only, rider HR / documents / location / availability / shifts,
--   work sessions and violations, legal requests, group membership and that person's group items).
-- Anonymised and kept while inside the retention window (link nulled, name/email/phone/address scrubbed):
--   support tickets (2 years after closing), order chat (6 months after completion),
--   account status log (2 years), delivery photos (30 days).
--   Past the window, those records are deleted. The privacy ticket is closed and anonymised.
-- Kept and anonymised, never deleted: orders, payment fields on the order, earnings, payouts,
--   customer credit (the reason code becomes 'erased'). Orders 1043 and 1046 are never modified;
--   their owners cannot be erased. An admin login cannot be deleted here either.
-- Legal acceptances stay as proof of which document was accepted, without the person, IP or user agent.
-- Order updates during erasure set fp.erasure so fp_order_commission skips recalculation in this
-- transaction only. The trigger stays enabled for every other session.

do $$
declare
  tgt record;
  rec record;
begin
  for tgt in
    select * from (values
      ('orders', 'customer_id'),
      ('orders', 'rider_id'),
      ('earnings', 'rider_id'),
      ('payouts', 'rider_id'),
      ('bids', 'rider_id'),
      ('customer_credit', 'customer_id'),
      ('support_tickets', 'created_by'),
      ('account_status_log', 'profile_id'),
      ('ratings', 'customer_id'),
      ('promo_codes', 'created_by'),
      ('group_orders', 'host_id'),
      ('audit_events', 'profile_id')
    ) as v(tbl, col)
  loop
    execute format('alter table public.%I alter column %I drop not null', tgt.tbl, tgt.col);
    for rec in
      select c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = ('public.' || quote_ident(tgt.tbl))::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and a.attname = tgt.col
        and array_length(c.conkey, 1) = 1
    loop
      execute format('alter table public.%I drop constraint %I', tgt.tbl, rec.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.profiles(id) on delete set null',
      tgt.tbl, tgt.tbl || '_' || tgt.col || '_fkey', tgt.col);
  end loop;
end $$;

alter table public.legal_acceptances alter column profile_id drop not null;

-- A rider payout has to name exactly one party, unless the rider was erased (both links null).
alter table public.payouts add column if not exists anonymised boolean not null default false;
alter table public.payouts drop constraint if exists payouts_one_party;
alter table public.payouts add constraint payouts_one_party check (
  ((rider_id is null) <> (restaurant_id is null)) or anonymised
);

-- Credit reasons are a fixed list. 'erased' is the neutral value once the customer is detached.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.customer_credit'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%reason%'
  loop
    execute format('alter table public.customer_credit drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.customer_credit add constraint customer_credit_reason_check
  check (reason in ('referral_new', 'referral_friend', 'used', 'admin', 'refund', 'erased'));

-- Skip commission and rider-bonus recalculation only inside the erasure transaction.
create or replace function public.fp_order_commission() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('fp.erasure', true) = 'on' then
    return new;
  end if;
  if new.status not in ('awaiting_payment', 'payment_failed', 'cancelled') then
    if new.commission_pct is null then
      new.commission_pct := fp_commission_rate(new.restaurant_id, coalesce(new.fulfilment, 'delivery'), coalesce(new.paid_at, now()));
    end if;
    new.commission_cents := round(new.subtotal_cents * new.commission_pct / 100.0)::int;
    if new.rider_bonus_cents is null and (tg_op = 'INSERT' or old.status in ('awaiting_payment', 'payment_failed')) then
      new.rider_bonus_cents := case when new.fulfilment = 'pickup' then 0
        else least(new.delivery_fee_cents, (select rider_bonus_cents from settings limit 1)) end;
    end if;
  end if;
  return new;
end $$;

-- Acceptance rows stay append-only, except the erasure path may drop the personal columns.
create or replace function public.fp_legal_immutable() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and current_setting('fp.erasure', true) = 'on' then
    return new;
  end if;
  raise exception 'legal_acceptances is append-only';
end $$;
revoke all on function public.fp_legal_immutable() from public, anon, authenticated;

create or replace function public.fp_scrub_identity(p_text text, p_tokens text[] default null, p_max int default null)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  t text;
  e text;
  s text := p_text;
begin
  if s is null then return null; end if;
  if p_tokens is not null then
    foreach t in array p_tokens loop
      if t is null then continue; end if;
      t := btrim(t);
      if length(t) < 3 then continue; end if;
      e := regexp_replace(t, '([.*+?^${}()|[\]\\])', E'\\\\\\1', 'g');
      s := regexp_replace(s, e, '[verwijderd]', 'gi');
    end loop;
  end if;
  s := regexp_replace(s, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[verwijderd]', 'g');
  if p_max is not null and char_length(s) > p_max then
    s := left(s, p_max);
  end if;
  if char_length(btrim(s)) = 0 then
    s := '[verwijderd]';
    if p_max is not null and char_length(s) > p_max then s := left(s, p_max); end if;
  end if;
  return s;
end $$;
revoke all on function public.fp_scrub_identity(text, text[], integer) from public, anon, authenticated;

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

  if cardinality(v_old_photos) > 0 then
    if to_regclass('storage.objects') is not null then
      delete from storage.objects where bucket_id = 'delivery-proof' and name = any (v_old_photos);
    end if;
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

  -- Support: drop tickets already past the 2-year window, close the privacy request, detach the rest.
  if to_regclass('storage.objects') is not null then
    delete from storage.objects o
    using public.support_messages m
    join public.support_tickets t on t.id = m.ticket_id
    where o.bucket_id = 'support-photos'
      and o.name = m.photo_path
      and t.created_by = p_id
      and t.status = 'resolved'
      and t.resolved_at < now() - interval '2 years';
  end if;
  delete from public.support_tickets
    where created_by = p_id and status = 'resolved' and resolved_at < now() - interval '2 years';

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

create or replace function public.fp_auth_user_deleted() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_role text;
begin
  select role::text into v_role from public.profiles where id = old.id;
  if v_role = 'admin' then
    raise exception 'admins cannot be erased here';
  end if;
  perform public.fp_cleanup_deleted_user(old.id);
  return old;
end $$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.fp_auth_user_deleted();

revoke all on function public.fp_cleanup_deleted_user(uuid) from public, anon, authenticated;
revoke all on function public.fp_auth_user_deleted() from public, anon, authenticated;
grant execute on function public.fp_cleanup_deleted_user(uuid) to service_role, supabase_auth_admin;
grant execute on function public.fp_auth_user_deleted() to service_role, supabase_auth_admin;

-- Admin erase and the direct auth delete share one cleanup. anonymise deletes the login
-- (the trigger cleans the profile). If the login is already gone, it cleans the orphan profile.
create or replace function public.fp_anonymise_profile(p_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_admin();
  if p_id is null then raise exception 'profile required'; end if;
  if p_id = auth.uid() then raise exception 'admins cannot erase their own account here'; end if;
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
  delete from auth.users where id = p_id;
  if not found then
    perform public.fp_cleanup_deleted_user(p_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fp_anonymise_profile(uuid) from public, anon;
grant execute on function public.fp_anonymise_profile(uuid) to authenticated;

create or replace function public.fp_erase_account(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_role text;
begin
  perform public.assert_admin();
  if p_id is null then raise exception 'profile required'; end if;
  if exists (select 1 from public.orders where id in (1043, 1046) and (customer_id = p_id or rider_id = p_id)) then
    raise exception 'protected account';
  end if;
  select role::text into v_role from public.profiles where id = p_id;
  if v_role is null then raise exception 'profile not found'; end if;
  if v_role = 'admin' then raise exception 'admins cannot be erased here'; end if;
  if p_id = auth.uid() then raise exception 'cannot erase yourself'; end if;
  return public.fp_anonymise_profile(p_id);
end $$;
revoke all on function public.fp_erase_account(uuid) from public, anon;
grant execute on function public.fp_erase_account(uuid) to authenticated;
