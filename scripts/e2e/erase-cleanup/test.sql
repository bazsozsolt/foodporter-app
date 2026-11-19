-- Throws if account deletion leaves a profile, an open privacy ticket, or identifiable retained rows.
-- Synthetic ids only. Orders 1043 and 1046 here are local fixtures, not the live orders.
drop trigger if exists legal_acc_immutable on public.legal_acceptances;
create trigger legal_acc_immutable before update or delete on public.legal_acceptances
  for each row execute function public.fp_legal_immutable();
create or replace function public.assert_true(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'FAIL %', p_msg;
  end if;
  raise notice 'PASS %', p_msg;
end $$;

do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  adm uuid := '22222222-2222-4222-8222-222222222222';
  prot uuid := '33333333-3333-4333-8333-333333333333';
  active uuid := '44444444-4444-4444-8444-444444444444';
  via_rpc uuid := '55555555-5555-4555-8555-555555555555';
  other uuid := '66666666-6666-4666-8666-666666666666';
  guest uuid := '77777777-7777-4777-8777-777777777777';
  rest uuid := '88888888-8888-4888-8888-888888888888';
  grp uuid := '99999999-9999-4999-8999-999999999999';
  v_msg text;
begin
  perform assert_true(
    (select prosecdef and exists (
      select 1 from unnest(proconfig) c where c like 'search_path=public, auth'
    ) from pg_proc where proname = 'fp_cleanup_deleted_user'),
    'cleanup is security definer with a fixed search_path');
  perform assert_true(
    not has_function_privilege('anon', 'public.fp_cleanup_deleted_user(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.fp_cleanup_deleted_user(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.fp_auth_user_deleted()', 'execute')
    and not has_function_privilege('authenticated', 'public.fp_auth_user_deleted()', 'execute'),
    'anon and authenticated cannot execute the cleanup');
  perform assert_true(
    has_function_privilege('authenticated', 'public.fp_erase_account(uuid)', 'execute')
    and exists (select 1 from pg_trigger where tgname = 'on_auth_user_deleted' and tgrelid = 'auth.users'::regclass),
    'erase stays available to signed-in admins and the auth delete trigger exists');
  perform assert_true(
    (select pg_get_constraintdef(oid) from pg_constraint where conname = 'support_tickets_created_by_fkey') like '%ON DELETE SET NULL%',
    'support tickets are detached instead of cascade-deleted');

  insert into auth.users(id, email) values
    (a, 'fp-erase+tag@example.com'),
    (adm, 'fp-admin@example.com'),
    (prot, 'fp-protected@example.com'),
    (active, 'fp-active@example.com'),
    (via_rpc, 'fp-rpc@example.com'),
    (other, 'fp-other@example.com'),
    (guest, 'fp-guest@example.com');
  insert into public.profiles(id, role, full_name, phone, email, iban) values
    (a, 'customer', 'FP TEST erase', '+31612345678', 'fp-erase+tag@example.com', 'NL91ABNA0417164300'),
    (adm, 'admin', 'FP TEST admin', null, 'fp-admin@example.com', null),
    (prot, 'customer', 'FP TEST protected', '0611111111', 'fp-protected@example.com', null),
    (active, 'customer', 'FP TEST active', '0622222222', 'fp-active@example.com', null),
    (via_rpc, 'rider', 'FP TEST rpc', '0633333333', 'fp-rpc@example.com', null),
    (other, 'customer', 'FP TEST other', '0644444444', 'fp-other@example.com', null),
    (guest, 'customer', 'FP TEST guest', null, 'fp-guest@example.com', null);

  insert into public.orders(id, customer_id, rider_id, restaurant_id, status, address, phone, subtotal_cents, delivery_fee_cents, commission_cents, mollie_payment_id, lat, lng, referral_code, delivery_photo_path, delivery_photo_at, delivered_at, created_at) values
    (2001, a, a, rest, 'delivered', 'FP TEST Heuvelstraat 12, 5038 AA Tilburg', '+31612345678', 1890, 295, 227, 'tr_test_keep', 51.55, 5.09, 'ERASECODE', '2001/recent.jpg', now() - interval '10 days', now() - interval '10 days', now() - interval '10 days'),
    (2002, a, null, rest, 'delivered', 'FP TEST Heuvelstraat 12, 5038 AA Tilburg', '+31612345678', 2500, 295, 300, 'tr_test_old', 51.55, 5.09, null, '2002/old.jpg', now() - interval '40 days', now() - interval '8 months', now() - interval '8 months'),
    (1043, prot, null, rest, 'delivered', 'PROTECTED 1043', '0611111111', 1000, 295, 120, 'tr_protected_1043', null, null, null, null, null, now() - interval '1 day', now() - interval '1 day'),
    (1046, other, null, rest, 'delivered', 'PROTECTED 1046', '0644444444', 1100, 295, 132, 'tr_protected_1046', null, null, null, null, null, now() - interval '1 day', now() - interval '1 day'),
    (2003, active, null, rest, 'picked_up', 'Active street 1', '0622222222', 900, 295, 108, 'tr_active', null, null, null, null, null, null, now()),
    (2004, via_rpc, via_rpc, rest, 'delivered', 'RPC street 9', '0633333333', 1600, 295, 192, 'tr_rpc', 51.5, 5.1, null, '2004/old.jpg', now() - interval '40 days', now() - interval '40 days', now() - interval '40 days');

  insert into public.order_items(id, order_id, name, guest_name) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 2001, 'Pizza', 'FP TEST erase');
  insert into public.order_messages(order_id, author_id, author_role, body) values
    (2001, a, 'customer', 'Ik ben FP TEST erase, adres FP TEST Heuvelstraat 12, 5038 AA Tilburg, mail fp-erase+tag@example.com'),
    (2002, a, 'customer', 'Oude chat van FP TEST erase');
  insert into public.earnings(id, rider_id, order_id, amount_cents) values
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', a, 2001, 295);
  insert into public.payouts(id, rider_id, amount_cents, reference) values
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', a, 295, 'NL91ABNA0417164300 week');
  insert into public.payouts(id, restaurant_id, amount_cents, reference) values
    ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', rest, 5000, 'restaurant payout');
  insert into public.customer_credit(customer_id, cents, reason, order_id) values
    (a, 500, 'refund', 2001);
  insert into public.bids(id, order_id, rider_id, rider_name) values
    ('dddddddd-dddd-4ddd-8ddd-ddddddddddd1', 2001, a, 'FP TEST erase');
  insert into public.ratings(order_id, customer_id, comment) values
    (2001, a, 'Lekker, groet FP TEST erase');
  insert into public.referral_codes(customer_id, code) values (a, 'ERASECODE');
  insert into public.push_subscriptions(id, profile_id, endpoint) values
    ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', a, 'https://push.example/fp-test');
  insert into public.rate_limits(profile_id, action) values (a, 'support_create');
  insert into public.feedback(user_id, email, message, user_agent) values
    (a, 'fp-erase+tag@example.com', 'Mail mij op fp-erase+tag@example.com', 'ua-secret');
  insert into public.legal_acceptances(template_id, profile_id, ip, user_agent) values
    ('privacy_statement', a, '203.0.113.10', 'secret-agent');
  insert into public.legal_requests(profile_id) values (a);
  insert into public.account_status_log(profile_id, reason, created_at) values
    (a, 'ask fp-erase+tag@example.com', now() - interval '6 months'),
    (a, 'old reason', now() - interval '3 years');
  insert into public.support_tickets(created_by, category, status, subject, lat, lng) values
    (a, 'privacy', 'open', 'Verzoek accountverwijdering', 51.55, 5.09);
  insert into public.support_messages(ticket_id, author_id, body) values
    (currval('support_tickets_id_seq'), a, 'Verwijder fp-erase+tag@example.com en +31612345678');
  insert into public.support_tickets(created_by, category, status, subject) values
    (a, 'late', 'open', 'Te laat voor FP TEST erase');
  insert into public.support_messages(ticket_id, author_id, body) values
    (currval('support_tickets_id_seq'), a, 'Bel +31612345678 over Heuvelstraat');
  insert into public.support_tickets(created_by, category, status, subject, resolved_at) values
    (a, 'other', 'resolved', 'Oud ticket', now() - interval '3 years');
  insert into public.support_messages(ticket_id, author_id, body, photo_path) values
    (currval('support_tickets_id_seq'), a, 'Oud bericht', a::text || '/old-photo.jpg');
  insert into public.ops_alerts(message) values ('SOS from FP TEST erase at the door');
  insert into public.rider_hr(profile_id, birthdate) values (a, '1990-01-01');
  insert into public.work_sessions(rider_id) values (a);
  insert into public.group_orders(id, host_id, restaurant_id) values (grp, a, rest);
  insert into public.group_members(group_id, user_id, display_name) values
    (grp, a, 'FP TEST erase'),
    (grp, guest, 'FP TEST guest');
  insert into public.group_items(id, group_id, user_id) values
    ('ffffffff-ffff-4fff-8fff-fffffffffff1', grp, a);
  insert into storage.objects(id, bucket_id, name, owner, owner_id, user_metadata) values
    ('11111111-aaaa-4aaa-8aaa-111111111111', 'delivery-proof', '2001/recent.jpg', a, a::text, '{"name":"FP TEST erase"}'),
    ('22222222-aaaa-4aaa-8aaa-222222222222', 'delivery-proof', '2002/old.jpg', a, a::text, '{}'),
    ('33333333-aaaa-4aaa-8aaa-333333333333', 'support-photos', a::text || '/old-photo.jpg', a, a::text, '{}'),
    ('44444444-aaaa-4aaa-8aaa-444444444444', 'delivery-proof', '2004/old.jpg', via_rpc, via_rpc::text, '{}');

  begin
    delete from auth.users where id = prot;
    raise exception 'expected protected account';
  exception when others then
    if position('protected account' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(exists (select 1 from public.profiles where id = prot), 'protected profile kept');
  perform assert_true(
    (select address = 'PROTECTED 1043' and phone = '0611111111' and customer_id = prot and mollie_payment_id = 'tr_protected_1043' from public.orders where id = 1043),
    'order 1043 unchanged');

  begin
    delete from auth.users where id = active;
    raise exception 'expected active order refusal';
  exception when others then
    if position('active order' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(exists (select 1 from auth.users where id = active), 'active-order login kept');

  perform set_config('fp.test_admin', 'on', true);
  perform set_config('fp.test_uid', active::text, true);
  begin
    perform public.fp_erase_account(active);
    raise exception 'expected self refusal';
  exception when others then
    if position('cannot erase yourself' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(true, 'erase refuses the signed-in admin');
  perform set_config('fp.test_uid', adm::text, true);
  begin
    perform public.fp_erase_account(adm);
    raise exception 'expected admin refusal';
  exception when others then
    if position('admins cannot be erased' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(exists (select 1 from public.profiles where id = adm), 'admin profile cannot be erased here');
  perform set_config('fp.test_admin', '', true);
  begin
    perform public.fp_erase_account(via_rpc);
    raise exception 'expected admin only';
  exception when others then
    if position('admin only' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(true, 'non-admin cannot call erase');

  delete from auth.users where id = a;

  perform assert_true(not exists (select 1 from auth.users where id = a), 'direct delete removes the login');
  perform assert_true(not exists (select 1 from public.profiles where id = a), 'direct delete removes the profile');
  perform assert_true(
    not exists (select 1 from public.support_tickets where category = 'privacy' and status <> 'resolved' and (created_by = a or created_by is null and subject ilike '%fp-erase%')),
    'no open privacy ticket');
  perform assert_true(
    exists (
      select 1 from public.support_tickets
      where category = 'privacy' and status = 'resolved' and created_by is null
        and subject = 'Accountverwijdering afgehandeld' and lat is null
    ),
    'privacy ticket closed and anonymised');
  perform assert_true(
    not exists (select 1 from public.support_messages where body ilike '%fp-erase%' or body ilike '%31612345678%'),
    'privacy and support messages no longer hold the email or phone');
  perform assert_true(
    exists (select 1 from public.support_tickets where category = 'late' and status = 'open' and created_by is null and subject not ilike '%FP TEST erase%'),
    'in-window support ticket kept, detached and scrubbed');
  perform assert_true(
    not exists (select 1 from public.support_tickets where subject = 'Oud ticket'),
    'support ticket past 2 years deleted');

  perform assert_true(
    (select customer_id is null and rider_id is null and phone = 'verwijderd' and address = 'verwijderd'
        and lat is null and lng is null and referral_code is null
        and subtotal_cents = 1890 and delivery_fee_cents = 295 and commission_cents = 227
        and mollie_payment_id = 'tr_test_keep' and delivery_photo_path = '2001/recent.jpg'
      from public.orders where id = 2001),
    'recent order kept, anonymised, photo inside 30 days kept, money unchanged');
  perform assert_true(
    (select customer_id is null and subtotal_cents = 2500 and commission_cents = 300
        and mollie_payment_id = 'tr_test_old' and delivery_photo_path is null
      from public.orders where id = 2002),
    'older order kept and its expired photo cleared');
  perform assert_true(
    exists (select 1 from public.order_messages where order_id = 2001 and author_id is null and body not ilike '%FP TEST erase%' and body not ilike '%Heuvelstraat%' and body not ilike '%example.com%'),
    'in-window order chat kept and scrubbed');
  perform assert_true(not exists (select 1 from public.order_messages where order_id = 2002), 'order chat past 6 months deleted');
  perform assert_true(
    (select guest_name = 'Verwijderde gebruiker' from public.order_items where order_id = 2001),
    'guest name on the order line scrubbed');
  perform assert_true(
    (select rider_id is null and amount_cents = 295 from public.earnings where order_id = 2001),
    'earning kept and detached');
  perform assert_true(
    (select rider_id is null and anonymised and amount_cents = 295 and reference not ilike '%ABNA%' from public.payouts where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'),
    'rider payout kept, anonymised, amount unchanged');
  perform assert_true(
    (select restaurant_id = rest and rider_id is null and not anonymised and amount_cents = 5000 from public.payouts where id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'),
    'unrelated restaurant payout unchanged');
  perform assert_true(
    (select customer_id is null and cents = 500 and reason = 'refund' from public.customer_credit where order_id = 2001),
    'credit ledger kept and detached');
  perform assert_true(
    (select rider_id is null and rider_name = 'Verwijderde gebruiker' from public.bids where order_id = 2001),
    'bid kept without the rider name');
  perform assert_true(
    (select customer_id is null and comment not ilike '%FP TEST erase%' from public.ratings where order_id = 2001),
    'rating kept and comment scrubbed');

  perform assert_true(not exists (select 1 from public.push_subscriptions where profile_id = a), 'push subscription removed');
  perform assert_true(not exists (select 1 from public.referral_codes where customer_id = a or code = 'ERASECODE'), 'referral code removed');
  perform assert_true(not exists (select 1 from public.rate_limits where profile_id = a), 'rate limit rows removed');
  perform assert_true(not exists (select 1 from public.rider_hr where profile_id = a), 'rider HR removed');
  perform assert_true(not exists (select 1 from public.work_sessions where rider_id = a), 'work session removed');
  perform assert_true(not exists (select 1 from public.legal_requests where profile_id = a), 'legal request removed');
  perform assert_true(not exists (select 1 from public.group_members where user_id = a), 'group membership removed');
  perform assert_true(not exists (select 1 from public.group_items where user_id = a), 'group items removed');
  perform assert_true(
    (select host_id is null from public.group_orders where id = grp)
    and exists (select 1 from public.group_members where user_id = guest and display_name = 'FP TEST guest'),
    'group kept for the other member, host detached');
  perform assert_true(
    (select profile_id is null and ip is null and user_agent is null and template_id = 'privacy_statement' from public.legal_acceptances where template_id = 'privacy_statement'),
    'legal acceptance kept without the person');
  perform assert_true(
    (select count(*) = 1 from public.account_status_log where reason like '%6 months%' or reason like '%[verwijderd]%')
    and not exists (select 1 from public.account_status_log where reason = 'old reason')
    and not exists (select 1 from public.account_status_log where profile_id = a or reason ilike '%fp-erase%'),
    'status log inside 2 years detached, older row deleted');
  perform assert_true(
    (select email is null and user_id is null and user_agent is null and message not ilike '%example.com%' from public.feedback where id = 1),
    'feedback detached and scrubbed');
  perform assert_true(
    (select message not ilike '%FP TEST erase%' from public.ops_alerts where id = 1),
    'ops alert scrubbed');
  perform assert_true(
    exists (select 1 from storage.objects where name = '2001/recent.jpg' and owner is null and owner_id is null)
    and not exists (select 1 from storage.objects where name = '2002/old.jpg')
    and not exists (select 1 from storage.objects where name like '%/old-photo.jpg'),
    'in-window photo detached, expired photos deleted');
  perform assert_true(
    (select address = 'PROTECTED 1046' and customer_id = other and phone = '0644444444' from public.orders where id = 1046),
    'order 1046 unchanged');
  perform assert_true(
    exists (select 1 from public.audit_events where type = 'profile_erased' and profile_id is null and to_value = 'deleted'),
    'erasure recorded without a profile link');

  perform set_config('fp.test_admin', 'on', true);
  perform set_config('fp.test_uid', adm::text, true);
  perform public.fp_erase_account(via_rpc);
  perform assert_true(not exists (select 1 from public.profiles where id = via_rpc), 'erase RPC removes the profile');
  perform assert_true(not exists (select 1 from auth.users where id = via_rpc), 'erase RPC removes the login');
  perform assert_true(
    (select customer_id is null and delivery_photo_path is null and commission_cents = 192 and mollie_payment_id = 'tr_rpc' and subtotal_cents = 1600 from public.orders where id = 2004),
    'RPC erase anonymises the order and clears an expired photo without rewriting the commission');
  perform assert_true(not exists (select 1 from storage.objects where name = '2004/old.jpg'), 'RPC erase deletes the expired photo object');

  perform set_config('fp.erasure', 'off', true);
  insert into public.legal_acceptances(template_id, profile_id, ip) values ('terms', other, '203.0.113.20');
  begin
    update public.legal_acceptances set ip = null where profile_id = other;
    raise exception 'expected append-only';
  exception when others then
    if position('append-only' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select ip = '203.0.113.20' from public.legal_acceptances where profile_id = other), 'legal acceptances stay append-only');

  begin
    execute 'set local role authenticated';
    begin
      perform public.fp_cleanup_deleted_user(other);
      raise exception 'authenticated executed cleanup';
    exception when insufficient_privilege then
      null;
    end;
    execute 'reset role';
  exception when others then
    execute 'reset role';
    get stacked diagnostics v_msg = message_text;
    raise exception 'role check failed: %', v_msg;
  end;
  perform assert_true(exists (select 1 from public.profiles where id = other), 'cleanup call as authenticated did nothing');
  perform assert_true(
    (select tgenabled = 'O' from pg_trigger where tgname = 'orders_zz_commission' and tgrelid = 'public.orders'::regclass),
    'commission trigger is still enabled');
end $$;
