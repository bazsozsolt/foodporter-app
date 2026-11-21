\set ON_ERROR_STOP on

create or replace function pg_temp.ok(msg text, cond boolean) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

-- ===========================================================================
-- Catalog / grants / posts drop / definer search_path (as superuser)
-- ===========================================================================
do $$
declare
  r record;
  names text[];
begin
  perform pg_temp.ok('posts table dropped',
    not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='posts'));
  perform pg_temp.ok('comments table dropped',
    not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                where n.nspname='public' and c.relname='comments'));
  perform pg_temp.ok('no leftover objects depend on posts/comments',
    not exists (
      select 1 from pg_depend d
      join pg_class c on c.oid = d.refobjid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname in ('posts','comments')
        and d.deptype <> 'p'));

  -- Neighbourhood helper is immutable, not definer; anon exec is intended.
  perform pg_temp.ok('fp_neighbourhood is not security definer',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname='fp_neighbourhood' and not p.prosecdef));
  perform pg_temp.ok('anon may execute fp_neighbourhood (intended)',
    has_function_privilege('anon', 'public.fp_neighbourhood(text, numeric)', 'execute'));
  perform pg_temp.ok('anon may execute fp_settings_public (intended)',
    has_function_privilege('anon', 'public.fp_settings_public()', 'execute'));

  names := array[
    'fp_rider_bid_board',
    'fp_bid_order_open',
    'fp_settings_public',
    'fp_settings_partner',
    'fp_settings_work'
  ];
  for r in
    select p.proname, p.prosecdef, p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(names)
  loop
    perform pg_temp.ok(r.proname || ' is SECURITY DEFINER', r.prosecdef);
    perform pg_temp.ok(r.proname || ' has search_path=public',
      r.proconfig is not null and exists (
        select 1 from unnest(r.proconfig) c where c like 'search_path=public%'));
  end loop;

  perform pg_temp.ok('anon cannot execute fp_rider_bid_board',
    not has_function_privilege('anon', 'public.fp_rider_bid_board()', 'execute'));
  perform pg_temp.ok('anon cannot execute fp_bid_order_open',
    not has_function_privilege('anon', 'public.fp_bid_order_open(bigint)', 'execute'));
  perform pg_temp.ok('anon cannot execute fp_settings_partner',
    not has_function_privilege('anon', 'public.fp_settings_partner()', 'execute'));
  perform pg_temp.ok('anon cannot execute fp_settings_work',
    not has_function_privilege('anon', 'public.fp_settings_work()', 'execute'));
  perform pg_temp.ok('authenticated can execute fp_rider_bid_board',
    has_function_privilege('authenticated', 'public.fp_rider_bid_board()', 'execute'));
  perform pg_temp.ok('authenticated can execute fp_bid_order_open',
    has_function_privilege('authenticated', 'public.fp_bid_order_open(bigint)', 'execute'));
  perform pg_temp.ok('authenticated can execute fp_settings_partner',
    has_function_privilege('authenticated', 'public.fp_settings_partner()', 'execute'));
  perform pg_temp.ok('authenticated can execute fp_settings_work',
    has_function_privilege('authenticated', 'public.fp_settings_work()', 'execute'));

  -- Views either security_invoker or (equivalently) select from a definer fn.
  perform pg_temp.ok('settings_public is a view over fp_settings_public',
    exists (select 1 from pg_views where schemaname='public' and viewname='settings_public'
            and definition ilike '%fp_settings_public%'));
  perform pg_temp.ok('settings_partner is a view over fp_settings_partner',
    exists (select 1 from pg_views where schemaname='public' and viewname='settings_partner'
            and definition ilike '%fp_settings_partner%'));
  perform pg_temp.ok('settings_work is a view over fp_settings_work',
    exists (select 1 from pg_views where schemaname='public' and viewname='settings_work'
            and definition ilike '%fp_settings_work%'));
  perform pg_temp.ok('rider_bid_orders is a view over fp_rider_bid_board',
    exists (select 1 from pg_views where schemaname='public' and viewname='rider_bid_orders'
            and definition ilike '%fp_rider_bid_board%'));

  perform pg_temp.ok('settings_public has no labour/payroll columns',
    not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='settings_public'
        and column_name in ('wml_cents','cao','cao_scale_cents','holiday_pay_pct','holiday_hours_pct',
                            'atw_max_shift_h','atw_max_shift_youth_h','atw_break_after_h','atw_week_max_h',
                            'atw_week_max_youth_h','atw_break_after_youth_h','surcharge_sat_pct',
                            'surcharge_sun_pct','surcharge_holiday_pct','surcharge_night_pct',
                            'night_from','night_to','overtime_pct','overtime_week_h','min_call_hours',
                            'call_notice_days','rest_min_h','pension_fund','pension_employee_pct',
                            'pension_employer_pct','payroll_provider','default_contract_kind',
                            'minmax_default_min_h','minmax_default_max_h','commission_delivery_pct',
                            'commission_intro_pct','commission_intro_months','commission_pickup_pct')));
  perform pg_temp.ok('settings_public exposes fees and min order',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='settings_public' and column_name='min_delivery_order_cents')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='settings_public' and column_name='service_fee_cents')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='settings_public' and column_name='delivery_fee_bands'));
  perform pg_temp.ok('settings_partner only has commission columns besides id',
    (select array_agg(column_name::text order by ordinal_position)
       from information_schema.columns
      where table_schema='public' and table_name='settings_partner')
    = array['id','commission_delivery_pct','commission_intro_pct','commission_intro_months','commission_pickup_pct']);
  perform pg_temp.ok('settings_work only has shift-planning columns besides id',
    (select array_agg(column_name::text order by ordinal_position)
       from information_schema.columns
      where table_schema='public' and table_name='settings_work')
    = array['id','atw_break_after_h','call_notice_days']);
  perform pg_temp.ok('rider_bid_orders has no address/phone/customer/lat/lng',
    not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='rider_bid_orders'
        and column_name in ('address','phone','customer_id','lat','lng')));
  perform pg_temp.ok('rider_bid_orders has neighbourhood and address_hidden',
    exists (select 1 from information_schema.columns where table_schema='public' and table_name='rider_bid_orders' and column_name='neighbourhood')
    and exists (select 1 from information_schema.columns where table_schema='public' and table_name='rider_bid_orders' and column_name='address_hidden'));
end $$;

-- fp_neighbourhood shape
do $$
begin
  perform pg_temp.ok('fp_neighbourhood masks street and keeps postcode+city+distance',
    public.fp_neighbourhood('Heuvelstraat 12, 5038 AA Tilburg', 1.2) = '5038, Tilburg · 1,2 km');
end $$;

-- ===========================================================================
-- ANON
-- ===========================================================================
set role anon;
do $$
declare n int; fee int; minc int;
begin
  begin
    select count(*) into n from settings;
    perform pg_temp.ok('anon settings select returns 0 rows (RLS)', coalesce(n,0) = 0);
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select settings (no grant)', true);
  end;

  select count(*), max(delivery_fee_cents), max(min_delivery_order_cents)
    into n, fee, minc from settings_public;
  perform pg_temp.ok('anon can read settings_public', n = 1);
  perform pg_temp.ok('anon settings_public min order is 1500 and fee present', minc = 1500 and fee is not null);

  begin
    perform count(*) from settings_partner;
    raise exception 'anon selected settings_partner';
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select settings_partner', true);
  when others then
    if sqlerrm like 'anon selected settings_partner' then raise; end if;
    perform pg_temp.ok('anon cannot select settings_partner', true);
  end;

  begin
    perform count(*) from settings_work;
    raise exception 'anon selected settings_work';
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select settings_work', true);
  when others then
    if sqlerrm like 'anon selected settings_work' then raise; end if;
    perform pg_temp.ok('anon cannot select settings_work', true);
  end;

  begin
    perform count(*) from orders;
    raise exception 'anon selected orders';
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select orders', true);
  when others then
    if sqlerrm like 'anon selected orders' then raise; end if;
    perform pg_temp.ok('anon cannot select orders', true);
  end;

  begin
    perform count(*) from rider_bid_orders;
    raise exception 'anon selected rider_bid_orders';
  exception when insufficient_privilege then
    perform pg_temp.ok('anon cannot select rider_bid_orders', true);
  when others then
    if sqlerrm like 'anon selected rider_bid_orders' then raise; end if;
    perform pg_temp.ok('anon cannot select rider_bid_orders', true);
  end;
end $$;
reset role;

-- ===========================================================================
-- CUSTOMER (Cara 002)
-- ===========================================================================
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$
declare n int; addr text; ph text;
begin
  select count(*) into n from settings;
  perform pg_temp.ok('customer cannot select settings labour (0 rows)', n = 0);

  select count(*) into n from settings_public;
  perform pg_temp.ok('customer can read settings_public', n = 1);

  select count(*) into n from settings_partner;
  perform pg_temp.ok('customer cannot read settings_partner', n = 0);

  select count(*) into n from settings_work;
  perform pg_temp.ok('customer cannot read settings_work', n = 0);

  select count(*) into n from rider_bid_orders;
  perform pg_temp.ok('customer bid board is empty', n = 0);

  select count(*) into n from orders where id = 3001;
  perform pg_temp.ok('customer can select own bid-pool order', n = 1);
  select address, phone into addr, ph from orders where id = 3001;
  perform pg_temp.ok('customer still sees own street and phone',
    addr like 'Heuvelstraat%' and ph is not null);

  select count(*) into n from orders where id = 3007;
  perform pg_temp.ok('customer cannot select other customer''s order', n = 0);

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3001, '00000000-0000-0000-0000-000000000002', 12, false);
    raise exception 'customer inserted a bid';
  exception when others then
    if sqlerrm like 'customer inserted a bid' then raise; end if;
    perform pg_temp.ok('customer cannot insert a bid', true);
  end;
end $$;

-- ===========================================================================
-- OTHER CUSTOMER (005)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$
declare n int;
begin
  select count(*) into n from orders where id in (3001, 3004, 3005);
  perform pg_temp.ok('other customer cannot select Cara orders', n = 0);
  select count(*) into n from orders where id = 3007;
  perform pg_temp.ok('other customer can select own order', n = 1);
  select count(*) into n from settings;
  perform pg_temp.ok('other customer cannot select settings', n = 0);
  select count(*) into n from rider_bid_orders;
  perform pg_temp.ok('other customer bid board is empty', n = 0);
end $$;

-- ===========================================================================
-- UNASSIGNED RIDER (006)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
do $$
declare
  n int;
  ids bigint[];
  hood text;
  hidden boolean;
  dist numeric;
  open_ok boolean;
  may_ok boolean;
begin
  select count(*) into n from orders where id = 3001;
  perform pg_temp.ok('unassigned rider cannot SELECT bid-pool order (no address/phone/customer/lat/lng)', n = 0);
  select count(*) into n from orders where id in (3004, 3005, 3006, 3007);
  perform pg_temp.ok('unassigned rider cannot SELECT assigned, delivered or others'' orders', n = 0);

  select array_agg(id order by id), count(*) into ids, n from rider_bid_orders;
  perform pg_temp.ok('unassigned rider board is only eligible real deliveries (3001,3007)',
    ids = array[3001::bigint, 3007::bigint]);

  select neighbourhood, address_hidden, distance_km into hood, hidden, dist
    from rider_bid_orders where id = 3001;
  perform pg_temp.ok('bid board neighbourhood is postcode+city+distance, no street',
    hood = '5038, Tilburg · 1,2 km' and hidden is true and dist = 1.2
    and hood not ilike '%Heuvelstraat%' and hood not ilike '%12%');

  select count(*) into n from rider_bid_orders where id = 3002;
  perform pg_temp.ok('pickup orders are not on the bid board', n = 0);
  select count(*) into n from rider_bid_orders where id = 3003;
  perform pg_temp.ok('test bid-pool order hidden from real rider', n = 0);

  select count(*) into n from settings;
  perform pg_temp.ok('unassigned rider cannot select settings labour', n = 0);
  select count(*) into n from settings_public;
  perform pg_temp.ok('unassigned rider can read settings_public', n = 1);
  select count(*) into n from settings_partner;
  perform pg_temp.ok('unassigned rider cannot read settings_partner', n = 0);
  select count(*) into n from settings_work;
  perform pg_temp.ok('unassigned rider can read settings_work', n = 1);
  perform pg_temp.ok('settings_work exposes only atw_break_after_h and call_notice_days',
    (select atw_break_after_h from settings_work) = 4.5
    and (select call_notice_days from settings_work) = 4);

  -- Helpers are boolean-only; they must not leak or mutate other orders.
  select fp_bid_order_open(3001), fp_may_bid(3001) into open_ok, may_ok;
  perform pg_temp.ok('fp_bid_order_open and fp_may_bid are booleans for an open order',
    open_ok is true and may_ok is true);
  perform pg_temp.ok('fp_bid_order_open is false for an already assigned order',
    fp_bid_order_open(3004) is false);
  perform pg_temp.ok('fp_bid_order_open is false for a pickup order',
    fp_bid_order_open(3002) is false);
  begin
    -- The helpers are read-only SQL functions; there is no UPDATE path.
    perform fp_bid_order_open(3001);
    update orders set address = 'leaked' where id = 3001;
    if found then raise exception 'unassigned rider updated a bid-pool order'; end if;
    perform pg_temp.ok('unassigned rider cannot update a bid-pool order via helpers (0 rows)', true);
  exception when others then
    if sqlerrm like 'unassigned rider updated%' then raise; end if;
    perform pg_temp.ok('unassigned rider cannot update a bid-pool order via helpers (error)', true);
  end;

  insert into bids(order_id, rider_id, eta_minutes, accepted)
    values (3001, '00000000-0000-0000-0000-000000000006', 15, false);
  perform pg_temp.ok('unassigned rider can insert a bid on an open delivery',
    exists (select 1 from bids where order_id=3001 and rider_id='00000000-0000-0000-0000-000000000006'));

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3002, '00000000-0000-0000-0000-000000000006', 15, false);
    raise exception 'bid on pickup order succeeded';
  exception when others then
    if sqlerrm like 'bid on pickup order succeeded' then raise; end if;
    perform pg_temp.ok('cannot bid on a pickup order', true);
  end;
  perform pg_temp.ok('no pickup bid row was stored',
    not exists (select 1 from bids where order_id=3002));

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3004, '00000000-0000-0000-0000-000000000006', 15, false);
    raise exception 'bid on assigned order succeeded';
  exception when others then
    if sqlerrm like 'bid on assigned order succeeded' then raise; end if;
    perform pg_temp.ok('cannot bid on an already assigned order', true);
  end;

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3001, '00000000-0000-0000-0000-000000000007', 15, false);
    raise exception 'bid as another rider_id succeeded';
  exception when others then
    if sqlerrm like 'bid as another rider_id succeeded' then raise; end if;
    perform pg_temp.ok('cannot insert a bid under another rider_id', true);
  end;

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3001, '00000000-0000-0000-0000-000000000006', 15, true);
    raise exception 'self-accepted bid succeeded';
  exception when others then
    if sqlerrm like 'self-accepted bid succeeded' then raise; end if;
    perform pg_temp.ok('cannot insert a pre-accepted bid', true);
  end;
end $$;

-- ===========================================================================
-- ASSIGNED RIDER (Rik 003) — also has a delivered order (3005)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$
declare n int; addr text; ph text; cust uuid; latv double precision;
begin
  select address, phone, customer_id, lat into addr, ph, cust, latv
    from orders where id = 3004;
  perform pg_temp.ok('assigned rider reads the full assigned order (address, phone, customer, lat)',
    addr like 'Nieuwlandstraat%' and ph is not null and cust is not null and latv is not null);

  select address into addr from orders where id = 3005;
  perform pg_temp.ok('assigned rider still reads the delivered order they completed',
    addr like 'Piusstraat%');

  select count(*) into n from orders where id in (3001, 3006, 3007);
  perform pg_temp.ok('assigned rider cannot SELECT bid-pool or someone else''s assigned order', n = 0);

  select count(*) into n from rider_bid_orders;
  perform pg_temp.ok('assigned (active) rider still sees the eligible bid board',
    n = 2);

  select count(*) into n from settings;
  perform pg_temp.ok('assigned rider cannot select settings labour', n = 0);
  select count(*) into n from settings_work;
  perform pg_temp.ok('assigned rider can read settings_work', n = 1);
end $$;

-- ===========================================================================
-- OTHER RIDER (007) who currently holds 3006
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007';
do $$
declare n int; addr text;
begin
  select address into addr from orders where id = 3006;
  perform pg_temp.ok('other rider reads the full order assigned to them',
    addr like 'Korvelseweg%');
  select count(*) into n from orders where id = 3004;
  perform pg_temp.ok('other rider cannot SELECT Rik''s assigned order', n = 0);
  select count(*) into n from settings;
  perform pg_temp.ok('other rider cannot select settings labour', n = 0);
end $$;

-- ===========================================================================
-- TEST RIDER (008) — only test bid-pool rows
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000008';
do $$
declare ids bigint[];
begin
  select array_agg(id order by id) into ids from rider_bid_orders;
  perform pg_temp.ok('test rider board is only the test bid-pool order (3003)',
    ids = array[3003::bigint]);
  perform pg_temp.ok('test rider neighbourhood has no street',
    (select neighbourhood from rider_bid_orders where id=3003) not ilike '%Spoorlaan%'
    and (select neighbourhood from rider_bid_orders where id=3003) ilike '%5014%');
end $$;

-- ===========================================================================
-- INACTIVE RIDER (00a)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare n int;
begin
  select count(*) into n from rider_bid_orders;
  perform pg_temp.ok('inactive rider bid board is empty', n = 0);
  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3001, '00000000-0000-0000-0000-00000000000a', 15, false);
    raise exception 'inactive rider bid succeeded';
  exception when others then
    if sqlerrm like 'inactive rider bid succeeded' then raise; end if;
    perform pg_temp.ok('inactive rider cannot insert a bid', true);
  end;
end $$;

-- ===========================================================================
-- RESTAURANT (Rosa 004, cafe 0xaa)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
declare n int; pct numeric;
begin
  select count(*) into n from settings;
  perform pg_temp.ok('restaurant cannot select settings labour/payroll', n = 0);
  select count(*) into n from settings_public;
  perform pg_temp.ok('restaurant can read settings_public', n = 1);
  select commission_delivery_pct into pct from settings_partner;
  perform pg_temp.ok('restaurant can read settings_partner commission', pct = 25);
  select count(*) into n from settings_work;
  perform pg_temp.ok('restaurant cannot read settings_work', n = 0);

  select count(*) into n from orders where id = 3001;
  perform pg_temp.ok('restaurant can select own bid-pool order (full row)', n = 1);
  select count(*) into n from orders where id = 3007;
  perform pg_temp.ok('restaurant cannot select the other restaurant''s order', n = 0);
  select count(*) into n from rider_bid_orders;
  perform pg_temp.ok('restaurant bid board is empty', n = 0);

  begin
    insert into bids(order_id, rider_id, eta_minutes, accepted)
      values (3001, '00000000-0000-0000-0000-000000000004', 10, false);
    raise exception 'restaurant inserted a bid';
  exception when others then
    if sqlerrm like 'restaurant inserted a bid' then raise; end if;
    perform pg_temp.ok('restaurant cannot insert a bid', true);
  end;
end $$;

-- ===========================================================================
-- OTHER RESTAURANT (009, 0xcc)
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000009';
do $$
declare n int;
begin
  select count(*) into n from orders where id in (3001, 3004);
  perform pg_temp.ok('other restaurant cannot select Cafe Real orders', n = 0);
  select count(*) into n from orders where id = 3007;
  perform pg_temp.ok('other restaurant can select own order', n = 1);
  select count(*) into n from settings;
  perform pg_temp.ok('other restaurant cannot select settings labour', n = 0);
  select count(*) into n from settings_partner;
  perform pg_temp.ok('other restaurant can read settings_partner', n = 1);
end $$;

-- ===========================================================================
-- ADMIN (001) — full settings read and write
-- ===========================================================================
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare n int; pay text; minc int;
begin
  select count(*) into n from settings;
  perform pg_temp.ok('admin can select the settings base table', n = 1);
  select payroll_provider, min_delivery_order_cents into pay, minc from settings;
  perform pg_temp.ok('admin can read labour/payroll columns',
    pay = 'secret-payroll-co' and minc = 1500);

  update settings
     set min_delivery_order_cents = 1600,
         payroll_provider = 'updated-payroll',
         atw_break_after_h = 5
   where id = true;
  perform pg_temp.ok('admin can update public and labour settings',
    (select min_delivery_order_cents from settings) = 1600
    and (select payroll_provider from settings) = 'updated-payroll'
    and (select atw_break_after_h from settings) = 5);

  -- restore so later checks stay stable if re-run in the same db
  update settings
     set min_delivery_order_cents = 1500,
         payroll_provider = 'secret-payroll-co',
         atw_break_after_h = 4.5
   where id = true;

  select count(*) into n from settings_public;
  perform pg_temp.ok('admin can read settings_public', n = 1);
  select count(*) into n from settings_partner;
  perform pg_temp.ok('admin can read settings_partner', n = 1);
  select count(*) into n from settings_work;
  perform pg_temp.ok('admin can read settings_work', n = 1);

  select count(*) into n from orders where id in (3001, 3004, 3005, 3006, 3007);
  perform pg_temp.ok('admin can select every order in the matrix', n = 5);
end $$;

-- Non-admin cannot update settings
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
do $$
begin
  begin
    update settings set min_delivery_order_cents = 1 where id = true;
    if found then raise exception 'restaurant updated settings'; end if;
    perform pg_temp.ok('restaurant cannot update settings (0 rows)', true);
  exception when others then
    if sqlerrm like 'restaurant updated settings' then raise; end if;
    perform pg_temp.ok('restaurant cannot update settings (error)', true);
  end;
end $$;

reset role;
reset request.jwt.claim.sub;

-- ===========================================================================
-- Reassignment: after rider_id moves, old rider loses the full row, new one gains it
-- (operator update as table owner; we only assert the resulting SELECT access)
-- ===========================================================================
update public.orders
   set rider_id = '00000000-0000-0000-0000-000000000003',
       assigned_at = now()
 where id = 3006;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000007';
do $$
declare n int;
begin
  select count(*) into n from orders where id = 3006;
  perform pg_temp.ok('after reassignment the previous rider cannot SELECT the order', n = 0);
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
do $$
declare addr text;
begin
  select address into addr from orders where id = 3006;
  perform pg_temp.ok('after reassignment the new rider reads the full order',
    addr like 'Korvelseweg%');
end $$;

-- Delivered access stays with the rider who completed it (3005 still Rik)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
do $$
declare n int;
begin
  select count(*) into n from orders where id = 3005;
  perform pg_temp.ok('a different rider cannot SELECT a delivered order they did not ride', n = 0);
end $$;

reset role;
reset request.jwt.claim.sub;
