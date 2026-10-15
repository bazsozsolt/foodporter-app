-- v19: riders in direct employment. zzp template archived, KvK dropped, shifts/availability, clock-in/out via online,
-- worked hours, age-based WML table in settings, weekly indicative pay summary, payroll CSV, Working Hours Act checks.

-- 1. library: archive zzp, publish v0.2 docs
alter table public.legal_templates add column if not exists status text not null default 'active' check (status in ('active','archived'));
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('rider_zzp','0.2','Overeenkomst van opdracht bezorger (zzp) – NIET IN GEBRUIK','rider',date '2026-10-15','legal/rider_zzp-v0.2.pdf','legal/rider_zzp.html','1b3a8eb8a7e7cbf77ae8a0e15f3f6559010f237cc0fdee8bd0784a8320c55811',false),
('rider_employment','0.2','Arbeidsovereenkomst bezorger (direct dienstverband)','rider',date '2026-10-15','legal/rider_employment-v0.2.pdf','legal/rider_employment.html','412846195b4dddcd77f6887afaff48f6485b81cfdf2add2862abc01c3f27357a',true),
('restaurant_partner','0.1','Partnerovereenkomst restaurant','restaurant',date '2026-10-15','legal/restaurant_partner-v0.1.pdf','legal/restaurant_partner.html','b8c63566081706d54bb7952004307c5a03ec7063b457819b30c3a6460fc5f0e6',true),
('customer_terms','0.1','Algemene voorwaarden klanten','customer',date '2026-10-15','legal/customer_terms-v0.1.pdf','legal/customer_terms.html','29e1209535854cc0b50194f4e10fb52d2c1f30b58e8884ffa478c226836acc2c',false),
('privacy_statement','0.2','Privacyverklaring (update v18)','all',date '2026-10-15','legal/privacy_statement-v0.2.pdf','legal/privacy_statement.html','d6f471e4f554582635f4a6447921de10a1ac4d6eb7e4f92468a6a2a2c7b7754b',false),
('dpa_restaurant','0.1','Verwerkersovereenkomst (DPA) restaurant + subverwerkers','restaurant',date '2026-10-15','legal/dpa_restaurant-v0.1.pdf','legal/dpa_restaurant.html','060893a8c0cb47c727ddeb790f4b5e8b40d6414a1ea2e6f3ca060bfdc0b33352',true),
('rider_conduct','0.1','Gedragscode bezorgers en veiligheids- en ongevallenprocedure','rider',date '2026-10-15','legal/rider_conduct-v0.1.pdf','legal/rider_conduct.html','8e5516ba76bb2277d6e26951121346d8aaa1e7035bd1dddab21436bf27929a3c',true),
('platform_transparency','0.2','Transparantieverklaring algoritmisch management (richtlijn 2024/2831)','rider',date '2026-10-15','legal/platform_transparency-v0.2.pdf','legal/platform_transparency.html','7a8516b294a43d3fb034484196d7c4968ca5dd74ff9076fc5aa509ee5e7d2041',true),
('dpia_gps','0.2','DPIA-opzet GPS-tracking en werktijdregistratie bezorgers','internal',date '2026-10-15','legal/dpia_gps-v0.2.pdf','legal/dpia_gps.html','cfac144b841fcf102f79f7fb5d0bc0b9d7e0aeb4e1af9ea4b80bc7a36a67b558',false),
('processing_register','0.2','Register van verwerkingsactiviteiten (art. 30 AVG)','internal',date '2026-10-15','legal/processing_register-v0.2.pdf','legal/processing_register.html','b856d5c7555137ca72793e3e2c0cb0f7adbf9fb4ae1dab644e1e67b6756d4857',false),
('rider_onboarding','0.2','Onboardingchecklist bezorger','internal',date '2026-10-15','legal/rider_onboarding-v0.2.pdf','legal/rider_onboarding.html','8aa41a24c7e01efc8e6856d3fc4a8671a411d69ffbdc95360574629910c4ef40',false),
('deactivation_appeal','0.1','Deactivatie-, bezwaar- en klachtenprocedure','all',date '2026-10-15','legal/deactivation_appeal-v0.1.pdf','legal/deactivation_appeal.html','4f9e5ed4bc549f905e5fdc7207366f8500f90f192e64e39bbf18d59cbeadbfd2',false)
on conflict (id, version) do update set sha256 = excluded.sha256, title = excluded.title, pdf_path = excluded.pdf_path, html_path = excluded.html_path, requires_acceptance = excluded.requires_acceptance;
update public.legal_templates set status = 'archived', requires_acceptance = false where id = 'rider_zzp';

-- 2. employment only
update public.rider_hr set contract_type = 'employment' where contract_type <> 'employment';
alter table public.rider_hr drop constraint if exists rider_hr_contract_type_check;
alter table public.rider_hr add constraint rider_hr_contract_type_check check (contract_type = 'employment');
delete from public.rider_onboarding where step = 'kvk_checked';
alter table public.rider_onboarding drop constraint if exists rider_onboarding_step_check;
alter table public.rider_onboarding add constraint rider_onboarding_step_check check (step in ('id_checked','right_to_work','age_checked','iban','loonheffing_form','bsn_entered','safety_briefing','licence','test_ride'));
delete from public.rider_documents where kind = 'kvk';
alter table public.rider_documents drop constraint if exists rider_documents_kind_check;
alter table public.rider_documents add constraint rider_documents_kind_check check (kind in ('id','right_to_work','licence','insurance'));

-- 3. settings: pay + ATW parameters (admin-editable)
alter table public.settings
  add column if not exists wml_cents jsonb not null default '{"16":517,"17":592,"18":750,"19":899,"20":1199,"21":1499}'::jsonb,
  add column if not exists wml_effective date not null default date '2026-07-01',
  add column if not exists holiday_pay_pct numeric not null default 8,
  add column if not exists holiday_hours_pct numeric not null default 7.69,
  add column if not exists atw_max_shift_h numeric not null default 12,
  add column if not exists atw_max_shift_youth_h numeric not null default 9,
  add column if not exists atw_break_after_h numeric not null default 5.5,
  add column if not exists atw_week_max_h numeric not null default 60,
  add column if not exists atw_week_max_youth_h numeric not null default 45;
create or replace function public.fp_valid_wml(j jsonb) returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(j) = 'object'
     and (select bool_and(k in ('16','17','18','19','20','21') and jsonb_typeof(v) = 'number' and (v::text)::numeric between 100 and 10000) from jsonb_each(j) as e(k, v))
     and j ? '21' $$;
alter table public.settings drop constraint if exists settings_wml_check;
alter table public.settings add constraint settings_wml_check check (fp_valid_wml(wml_cents) and holiday_pay_pct between 8 and 20 and holiday_hours_pct between 7.69 and 20
  and atw_max_shift_h between 4 and 12 and atw_max_shift_youth_h between 4 and 9 and atw_break_after_h between 4 and 5.5 and atw_week_max_h between 20 and 60 and atw_week_max_youth_h between 10 and 45);

-- 4. shifts
create table if not exists public.rider_availability (
  id bigint generated always as identity primary key,
  rider_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours')
);
create index if not exists rider_avail_idx on public.rider_availability(rider_id, starts_at);
create table if not exists public.work_sessions (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  clock_in timestamptz not null default now(), clock_out timestamptz,
  closed_by text check (closed_by in ('rider','system','admin')),
  note text check (char_length(note) <= 200),
  is_test boolean not null default false,
  check (clock_out is null or clock_out >= clock_in)
);
create unique index if not exists work_sessions_one_open on public.work_sessions(rider_id) where clock_out is null;
create index if not exists work_sessions_rider on public.work_sessions(rider_id, clock_in);
create table if not exists public.work_violations (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  day date not null, kind text not null check (kind in ('max_shift','break','weekly_max','youth_night')),
  detail text, created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid,
  unique (rider_id, day, kind)
);
alter table public.ops_alerts drop constraint if exists ops_alerts_kind_check;
alter table public.ops_alerts add constraint ops_alerts_kind_check check (kind = any (array['restaurant_timeout','no_bid','refund_failed','out_of_zone','late_payment','other','sos','doc_expiry','legal','atw']));

alter table public.rider_availability enable row level security;
alter table public.work_sessions enable row level security;
alter table public.work_violations enable row level security;
revoke all on public.rider_availability, public.work_sessions, public.work_violations from anon, authenticated;
grant select, insert, delete on public.rider_availability to authenticated;
grant select, insert, update, delete on public.work_sessions to authenticated;
grant select, update on public.work_violations to authenticated;
create policy avail_read on public.rider_availability for select to authenticated using (rider_id = (select auth.uid()) or (select my_role())::text = 'admin');
create policy avail_ins on public.rider_availability for insert to authenticated with check (
  ((rider_id = (select auth.uid()) and (select my_role())::text = 'rider') or (select my_role())::text = 'admin')
  and ends_at > now() and starts_at < now() + interval '28 days');
create policy avail_del on public.rider_availability for delete to authenticated using (rider_id = (select auth.uid()) or (select my_role())::text = 'admin');
create policy ws_read on public.work_sessions for select to authenticated using (rider_id = (select auth.uid()) or (select my_role())::text = 'admin');
create policy ws_admin_ins on public.work_sessions for insert to authenticated with check ((select my_role())::text = 'admin');
create policy ws_admin_upd on public.work_sessions for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin');
create policy ws_admin_del on public.work_sessions for delete to authenticated using ((select my_role())::text = 'admin' and is_test);
create policy wv_read on public.work_violations for select to authenticated using (rider_id = (select auth.uid()) or (select my_role())::text = 'admin');
create policy wv_admin_upd on public.work_violations for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin');

-- clock in/out = going online/offline
create or replace function public.fp_clock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'rider' and new.online and not coalesce(old.online, false) then
    insert into work_sessions(rider_id, clock_in, is_test) values (new.id, now(), coalesce(new.is_test, false)) on conflict do nothing;
  elsif not new.online and coalesce(old.online, false) then
    update work_sessions set clock_out = now(), closed_by = case when auth.uid() = new.id then 'rider' when auth.uid() is not null then 'admin' else 'system' end
     where rider_id = new.id and clock_out is null;
  end if;
  return null;
end $$;
drop trigger if exists profiles_clock on public.profiles;
create trigger profiles_clock after update of online on public.profiles for each row execute function public.fp_clock();
insert into public.work_sessions(rider_id, clock_in, is_test)
select id, now(), coalesce(is_test, false) from public.profiles where role = 'rider' and online on conflict do nothing;

-- time helpers (Europe/Amsterdam days and ISO weeks)
create or replace function public.fp_worked_minutes(p_rider uuid, p_from timestamptz, p_to timestamptz) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(extract(epoch from least(coalesce(clock_out, now()), p_to) - greatest(clock_in, p_from)) / 60), 0)
  from work_sessions where rider_id = p_rider and clock_in < p_to and coalesce(clock_out, now()) > p_from $$;
-- minutes worked since the last break of >= 15 minutes
create or replace function public.fp_stretch_minutes(p_rider uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare s record; total numeric := 0; prev_in timestamptz := null;
begin
  for s in select clock_in, coalesce(clock_out, now()) co from work_sessions where rider_id = p_rider and clock_in > now() - interval '24 hours' order by clock_in desc loop
    if prev_in is null then
      if s.co < now() - interval '15 minutes' then return 0; end if;
    elsif prev_in - s.co >= interval '15 minutes' then exit;
    end if;
    total := total + extract(epoch from s.co - s.clock_in) / 60; prev_in := s.clock_in;
  end loop;
  return total;
end $$;
create or replace function public.fp_rider_age(p_rider uuid, p_on date default (now() at time zone 'Europe/Amsterdam')::date) returns int
language sql stable security definer set search_path = public as $$
  select extract(year from age(p_on, birthdate))::int from rider_hr where profile_id = p_rider and birthdate is not null $$;

-- 5. readiness (employment only, ATW)
create or replace function public.fp_rider_legal_status(p_rider uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare miss text[] := '{}'; st settings; age int; hr_now int; s text; r record;
  day0 timestamptz := ((now() at time zone 'Europe/Amsterdam')::date)::timestamp at time zone 'Europe/Amsterdam';
  wk0 timestamptz := (date_trunc('week', now() at time zone 'Europe/Amsterdam'))::timestamp at time zone 'Europe/Amsterdam';
begin
  if p_rider is distinct from auth.uid() and coalesce(my_role()::text,'') <> 'admin' and auth.uid() is not null then raise exception 'not allowed'; end if;
  select * into st from settings limit 1;
  if not fp_has_accepted('rider_employment', p_rider, null) then miss := miss || 'contract'::text; end if;
  if not fp_has_accepted('rider_conduct', p_rider, null) then miss := miss || 'conduct'::text; end if;
  if not fp_has_accepted('platform_transparency', p_rider, null) then miss := miss || 'transparency'::text; end if;
  for r in select template_id from legal_requests where profile_id = p_rider and status in ('sent','expired') loop miss := miss || ('pending:' || r.template_id); end loop;
  foreach s in array array['id_checked','right_to_work','age_checked','iban','loonheffing_form','bsn_entered','safety_briefing'] loop
    if not exists (select 1 from rider_onboarding where profile_id = p_rider and step = s) then miss := miss || ('step:' || s); end if;
  end loop;
  for r in select kind from rider_documents where profile_id = p_rider and expires_on < current_date and kind in ('id','right_to_work') loop miss := miss || ('doc_expired:' || r.kind); end loop;
  age := fp_rider_age(p_rider);
  hr_now := extract(hour from now() at time zone 'Europe/Amsterdam')::int;
  if age is not null and age < 16 then miss := miss || 'age_under_16'::text;
  elsif age is not null and age < 18 and (hr_now >= 23 or hr_now < 6) then miss := miss || 'youth_night'::text; end if;
  if fp_worked_minutes(p_rider, day0, now()) >= 60 * (case when age < 18 then st.atw_max_shift_youth_h else st.atw_max_shift_h end) then miss := miss || 'atw_max_shift'::text; end if;
  if fp_worked_minutes(p_rider, wk0, now()) >= 60 * (case when age < 18 then st.atw_week_max_youth_h else st.atw_week_max_h end) then miss := miss || 'atw_week_max'::text; end if;
  if fp_stretch_minutes(p_rider) >= 60 * st.atw_break_after_h then miss := miss || 'atw_break'::text; end if;
  return jsonb_build_object('ready', cardinality(miss) = 0, 'missing', to_jsonb(miss), 'contract_type', 'employment');
end $$;

-- 6. weekly indicative pay summary
create or replace function public.fp_rider_week(p_rider uuid, p_week date default (now() at time zone 'Europe/Amsterdam')::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st settings; ws date := date_trunc('week', p_week)::date; t0 timestamptz; t1 timestamptz; mins numeric; age int; rate int;
  wage int; bonus int; tips int; dels int; hol int; prof profiles; nviol int; shifts int;
begin
  if p_rider is distinct from auth.uid() and coalesce(my_role()::text,'') <> 'admin' and auth.uid() is not null then raise exception 'not allowed'; end if;
  select * into st from settings limit 1;
  select * into prof from profiles where id = p_rider;
  t0 := ws::timestamp at time zone 'Europe/Amsterdam'; t1 := (ws + 7)::timestamp at time zone 'Europe/Amsterdam';
  mins := round(fp_worked_minutes(p_rider, t0, t1));
  select count(*) into shifts from work_sessions where rider_id = p_rider and clock_in >= t0 and clock_in < t1;
  age := fp_rider_age(p_rider, ws);
  rate := case when age is not null and age < 16 then 0 else coalesce((st.wml_cents ->> least(coalesce(age, 21), 21)::text)::int, (st.wml_cents ->> '21')::int) end;
  wage := round(mins / 60.0 * rate);
  select coalesce(sum(amount_cents - coalesce(tip_cents, 0)), 0), coalesce(sum(coalesce(tip_cents, 0)), 0), count(*) into bonus, tips, dels
    from earnings where rider_id = p_rider and earned_at >= t0 and earned_at < t1;
  hol := round((wage + bonus) * st.holiday_pay_pct / 100.0);
  select count(*) into nviol from work_violations where rider_id = p_rider and day >= ws and day < ws + 7;
  return jsonb_build_object('rider_id', p_rider, 'name', prof.full_name, 'email', prof.email, 'is_test', prof.is_test,
    'week_start', ws, 'minutes', mins, 'hours', round(mins / 60.0, 2), 'shifts', shifts, 'age', age, 'age_known', age is not null,
    'wml_rate_cents', rate, 'wage_cents', wage, 'bonus_cents', bonus, 'tips_cents', tips, 'deliveries', dels,
    'holiday_pay_pct', st.holiday_pay_pct, 'holiday_pay_cents', hol, 'holiday_hours', round(mins / 60.0 * st.holiday_hours_pct / 100.0, 2),
    'gross_cents', wage + bonus + tips + hol, 'violations', nviol, 'indicative', true);
end $$;
create or replace function public.fp_payroll_week(p_week date) returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return query select fp_rider_week(p.id, p_week) from profiles p where p.role = 'rider' order by p.full_name;
end $$;

-- 7. ATW monitoring (cron): violations + admin alerts, auto clock-out at max shift when no active job
create or replace function public.fp_atw_check() returns int language plpgsql security definer set search_path = public as $$
declare st settings; r record; n int := 0; age int; maxs numeric; wmax numeric; dmin numeric; wmin numeric; smin numeric; hr_now int;
  d date := (now() at time zone 'Europe/Amsterdam')::date;
  day0 timestamptz := ((now() at time zone 'Europe/Amsterdam')::date)::timestamp at time zone 'Europe/Amsterdam';
  wk0 timestamptz := (date_trunc('week', now() at time zone 'Europe/Amsterdam'))::timestamp at time zone 'Europe/Amsterdam';
  busy boolean; vid bigint;
begin
  select * into st from settings limit 1;
  update work_sessions w set clock_out = now(), closed_by = 'system' from profiles p where p.id = w.rider_id and w.clock_out is null and not p.online;
  hr_now := extract(hour from now() at time zone 'Europe/Amsterdam')::int;
  for r in select p.id, p.full_name from profiles p where p.role = 'rider' and p.online loop
    age := fp_rider_age(r.id);
    maxs := 60 * case when age < 18 then st.atw_max_shift_youth_h else st.atw_max_shift_h end;
    wmax := 60 * case when age < 18 then st.atw_week_max_youth_h else st.atw_week_max_h end;
    dmin := fp_worked_minutes(r.id, day0, now()); wmin := fp_worked_minutes(r.id, wk0, now()); smin := fp_stretch_minutes(r.id);
    busy := exists (select 1 from orders where rider_id = r.id and status in ('assigned','ready','picked_up'));
    vid := null;
    if smin > 60 * st.atw_break_after_h + 5 then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'break', format('%s min without a 15+ min break', round(smin)))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s worked %s min without a break (limit %s h)', coalesce(r.full_name, 'rider'), round(smin), st.atw_break_after_h)); n := n + 1; end if;
    end if;
    vid := null;
    if dmin > maxs then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'max_shift', format('%s min today (limit %s)', round(dmin), maxs))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s exceeded the max shift (%s min, limit %s)%s', coalesce(r.full_name, 'rider'), round(dmin), maxs, case when busy then '; on a delivery' else '; clocked out' end)); n := n + 1; end if;
      if not busy then update profiles set online = false where id = r.id; end if;
    end if;
    vid := null;
    if wmin > wmax then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'weekly_max', format('%s min this week (limit %s)', round(wmin), wmax))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s exceeded the weekly max (%s min)', coalesce(r.full_name, 'rider'), round(wmin))); n := n + 1; end if;
    end if;
    vid := null;
    if age is not null and age < 18 and (hr_now >= 23 or hr_now < 6) then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'youth_night', 'online between 23:00 and 06:00 (under 18), clocked out')
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s (under 18) was online after 23:00, clocked out', coalesce(r.full_name, 'rider'))); n := n + 1; end if;
      update profiles set online = false where id = r.id;
    end if;
  end loop;
  return n;
end $$;
select cron.schedule('fp-atw', '*/5 * * * *', 'select public.fp_atw_check()');

revoke execute on function public.fp_clock(), public.fp_atw_check(), public.fp_worked_minutes(uuid, timestamptz, timestamptz), public.fp_stretch_minutes(uuid), public.fp_rider_age(uuid, date), public.fp_valid_wml(jsonb) from public, anon, authenticated;
revoke execute on function public.fp_rider_week(uuid, date), public.fp_payroll_week(date), public.fp_rider_legal_status(uuid) from public, anon;
grant execute on function public.fp_rider_week(uuid, date), public.fp_payroll_week(date), public.fp_rider_legal_status(uuid) to authenticated;
grant execute on function public.fp_valid_wml(jsonb) to authenticated; -- used by the settings check constraint on admin updates

-- 8. test accounts: new mandatory steps + v0.2 signatures (test_seed)
insert into public.rider_onboarding(profile_id, step, done_by, note)
select p.id, s, null, 'test seed' from public.profiles p cross join unnest(array['loonheffing_form','bsn_entered']) s
where p.role = 'rider' and p.is_test on conflict do nothing;
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'rider' and p.is_test and t.id in ('rider_employment','platform_transparency') and t.version = '0.2';
-- admin "run checks now" (same as the 5-minute cron)
create or replace function public.fp_atw_check_now() returns int language plpgsql security definer set search_path = public as $$
begin perform assert_admin(); return fp_atw_check(); end $$;
revoke execute on function public.fp_atw_check_now() from public, anon;
grant execute on function public.fp_atw_check_now() to authenticated;
