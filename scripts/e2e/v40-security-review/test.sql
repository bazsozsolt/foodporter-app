\set ON_ERROR_STOP on

create or replace function pg_temp.ok(msg text, cond boolean) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

-- Reports (as admin)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

do $$
declare incl jsonb; real jsonb;
begin
  incl := report_payments('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', true);
  real := report_payments('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', false);
  perform pg_temp.ok('payments include: 2 platform orders', (incl->'platform'->>'orders')::int = 2);
  perform pg_temp.ok('payments real-only: 1 platform order', (real->'platform'->>'orders')::int = 1);
  perform pg_temp.ok('payments real-only commission is 162', (real->'platform'->>'commission_cents')::int = 162);
  perform pg_temp.ok('payments include commission 462', (incl->'platform'->>'commission_cents')::int = 462);
  perform pg_temp.ok('payments real rider unpaid is 295', (real->'riders'->0->>'unpaid_cents')::int = 295);
  perform pg_temp.ok('payments include rider unpaid is 345', (incl->'riders'->0->>'unpaid_cents')::int = 345);
  -- 2-arg call still works (default include)
  perform pg_temp.ok('payments 2-arg default includes test', (report_payments('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02')->'platform'->>'orders')::int = 2);
end $$;

do $$
declare incl jsonb; real jsonb;
begin
  incl := report_delivery('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', true);
  real := report_delivery('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', false);
  perform pg_temp.ok('delivery include delivered=2', (incl->>'delivered')::int = 2);
  perform pg_temp.ok('delivery real delivered=1', (real->>'delivered')::int = 1);
end $$;

do $$
declare incl jsonb; real jsonb;
begin
  incl := report_quality('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', true);
  real := report_quality('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', false);
  perform pg_temp.ok('quality include orders=2', (incl->>'orders')::int = 2);
  perform pg_temp.ok('quality real orders=1', (real->>'orders')::int = 1);
end $$;

do $$
declare incl jsonb; real jsonb;
begin
  incl := report_safety('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', true);
  real := report_safety('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', false);
  perform pg_temp.ok('safety include incidents=2', (incl->>'incidents_total')::int = 2);
  perform pg_temp.ok('safety real incidents=1', (real->>'incidents_total')::int = 1);
end $$;

-- Non-admin cannot call reports
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
begin
  begin
    perform report_payments('2026-10-13 00:00:00+02', '2026-10-14 00:00:00+02', false);
    raise exception 'customer should not call report_payments';
  exception when others then
    if sqlerrm not like 'admin only%' then raise; end if;
    perform pg_temp.ok('customer report_payments refused', true);
  end;
end $$;

-- Anon grants removed
do $$
begin
  perform pg_temp.ok('anon has no promo_codes privileges',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='promo_codes' and grantee='anon'));
  perform pg_temp.ok('anon has no customer_credit privileges',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='customer_credit' and grantee='anon'));
  perform pg_temp.ok('anon has no account_status_log privileges',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='account_status_log' and grantee='anon'));
  perform pg_temp.ok('anon has no referral_codes privileges',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='referral_codes' and grantee='anon'));
  perform pg_temp.ok('anon cannot write legal_templates_current',
    not exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='legal_templates_current' and grantee='anon'
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')));
  perform pg_temp.ok('anon can still select legal_templates_current',
    exists (
      select 1 from information_schema.role_table_grants
      where table_schema='public' and table_name='legal_templates_current' and grantee='anon'
        and privilege_type='SELECT'));
end $$;

-- Negative RLS as customer / rider / restaurant / anon
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Cara

do $$
declare n int; r text;
begin
  select count(*) into n from profiles;
  perform pg_temp.ok('customer sees only own profile', n = 1);
  select count(*) into n from orders;
  perform pg_temp.ok('customer sees only own orders', n = 2);
  select count(*) into n from orders where customer_id <> '00000000-0000-0000-0000-000000000002';
  perform pg_temp.ok('customer sees no one else''s orders', n = 0);
  select count(*) into n from earnings;
  perform pg_temp.ok('customer cannot see earnings', n = 0);
  select count(*) into n from rider_hr;
  perform pg_temp.ok('customer cannot see rider HR', n = 0);
  select count(*) into n from promo_codes;
  perform pg_temp.ok('customer cannot read promo_codes', n = 0);
  begin
    insert into rider_hr(profile_id, contract_kind) values ('00000000-0000-0000-0000-000000000002', 'x');
    raise exception 'customer inserted rider_hr';
  exception when others then
    perform pg_temp.ok('customer cannot insert rider_hr', true);
  end;
  begin
    update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';
    -- WITH CHECK should reject; if 0 rows, also ok
    if found then raise exception 'customer changed role'; end if;
    perform pg_temp.ok('customer cannot change own role (0 rows)', true);
  exception when others then
    if sqlerrm like 'customer changed role' then raise; end if;
    perform pg_temp.ok('customer cannot change own role (error)', true);
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- other customer
do $$
declare n int;
begin
  select count(*) into n from orders;
  perform pg_temp.ok('other customer sees no Cara orders', n = 0);
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- rider
do $$
declare n int;
begin
  select count(*) into n from earnings;
  perform pg_temp.ok('rider sees own earnings', n = 2);
  select count(*) into n from rider_hr where profile_id = '00000000-0000-0000-0000-000000000003';
  perform pg_temp.ok('rider sees own HR', n = 1);
  begin
    update rider_hr set contract_kind = 'hacked' where profile_id = '00000000-0000-0000-0000-000000000003';
    if found then raise exception 'rider updated HR'; end if;
    perform pg_temp.ok('rider cannot update HR (no policy, 0 rows)', true);
  exception when others then
    if sqlerrm like 'rider updated HR' then raise; end if;
    perform pg_temp.ok('rider cannot update HR (error)', true);
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- restaurant
do $$
declare n int;
begin
  select count(*) into n from orders where restaurant_id = '00000000-0000-0000-0000-0000000000aa';
  perform pg_temp.ok('restaurant sees own restaurant orders', n = 1);
  select count(*) into n from orders where restaurant_id <> '00000000-0000-0000-0000-0000000000aa';
  perform pg_temp.ok('restaurant does not see other restaurant orders', n = 0);
  select count(*) into n from rider_hr;
  perform pg_temp.ok('restaurant cannot see rider HR', n = 0);
  select count(*) into n from earnings;
  perform pg_temp.ok('restaurant cannot see rider earnings', n = 0);
end $$;

reset role;
reset request.jwt.claim.sub;

-- anon: settings readable, promo not
set role anon;
do $$
declare n int;
begin
  select count(*) into n from settings;
  perform pg_temp.ok('anon can read settings', n = 1);
  begin
    perform count(*) from promo_codes;
    raise exception 'anon selected promo_codes';
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select promo_codes (no grant)', true);
  when others then
    if sqlerrm like 'anon selected promo_codes' then raise; end if;
    perform pg_temp.ok('anon cannot select promo_codes', true);
  end;
end $$;

reset role;
