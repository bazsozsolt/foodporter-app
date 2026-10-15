-- v20: CAO Beroepsgoederenvervoer profile (youth wages, surcharges, 4.5 h break, leave, pension placeholder),
-- contract kinds (0-hours on-call / min-max) with call-in roster (4-day notice, 3 h minimum, short-notice cancellation),
-- 12 h rest between shifts, extra ATW averages, fixed-hours offer reminder, provider-neutral payroll export.

-- settings
alter table public.settings
  add column if not exists cao text not null default 'bgv' check (cao in ('none','bgv')),
  add column if not exists cao_avv_until date default date '2027-01-01',
  add column if not exists cao_scale_cents int not null default 1471,
  add column if not exists surcharge_sat_pct numeric not null default 50,
  add column if not exists surcharge_sun_pct numeric not null default 100,
  add column if not exists surcharge_holiday_pct numeric not null default 100,
  add column if not exists surcharge_night_pct numeric not null default 19,
  add column if not exists night_from time not null default '21:00',
  add column if not exists night_to time not null default '05:00',
  add column if not exists overtime_pct numeric not null default 30,
  add column if not exists overtime_week_h numeric not null default 40,
  add column if not exists min_call_hours numeric not null default 3,
  add column if not exists call_notice_days int not null default 4,
  add column if not exists rest_min_h numeric not null default 12,
  add column if not exists atw_break_after_youth_h numeric not null default 4.5,
  add column if not exists pension_fund text default 'Pensioenfonds Vervoer (Bpf Vervoer) – placeholder, check verplichtstelling',
  add column if not exists pension_employee_pct numeric,
  add column if not exists pension_employer_pct numeric,
  add column if not exists payroll_provider text default '{{PAYROLL_PROVIDER}}';
alter table public.settings drop constraint if exists settings_v20_check;
alter table public.settings add constraint settings_v20_check check (
  surcharge_sat_pct between 0 and 200 and surcharge_sun_pct between 0 and 300 and surcharge_holiday_pct between 0 and 300
  and surcharge_night_pct between 0 and 100 and overtime_pct between 0 and 100 and overtime_week_h between 20 and 60
  and min_call_hours between 3 and 8 and call_notice_days between 4 and 14 and rest_min_h between 11 and 16
  and atw_break_after_youth_h between 4 and 4.5 and cao_scale_cents between 0 and 10000
  and (pension_employee_pct is null or pension_employee_pct between 0 and 30) and (pension_employer_pct is null or pension_employer_pct between 0 and 30));
-- apply the CAO BGV profile now: CAO youth % of WML (16 50%, 17 56%, 18 63%, 19 72%, 20 83%), 21+ max(scale A1, WML), 4.5 h break, 24 + 3.5 ATV days
update public.settings set cao = 'bgv', wml_cents = '{"16":750,"17":839,"18":944,"19":1079,"20":1244,"21":1499}'::jsonb,
  atw_break_after_h = 4.5, holiday_hours_pct = 10.58, updated_at = now();

create table if not exists public.public_holidays (day date primary key, name text not null);
alter table public.public_holidays enable row level security;
revoke all on public.public_holidays from anon, authenticated;
grant select on public.public_holidays to authenticated;
grant insert, update, delete on public.public_holidays to authenticated;
create policy hol_read on public.public_holidays for select to authenticated using (true);
create policy hol_admin_ins on public.public_holidays for insert to authenticated with check ((select my_role())::text = 'admin');
create policy hol_admin_upd on public.public_holidays for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin');
create policy hol_admin_del on public.public_holidays for delete to authenticated using ((select my_role())::text = 'admin');
insert into public.public_holidays values
 ('2026-01-01','Nieuwjaarsdag'),('2026-04-06','Tweede Paasdag'),('2026-04-27','Koningsdag'),('2026-05-14','Hemelvaartsdag'),
 ('2026-05-25','Tweede Pinksterdag'),('2026-12-25','Eerste Kerstdag'),('2026-12-26','Tweede Kerstdag'),
 ('2027-01-01','Nieuwjaarsdag'),('2027-03-29','Tweede Paasdag'),('2027-04-27','Koningsdag'),('2027-05-06','Hemelvaartsdag'),
 ('2027-05-17','Tweede Pinksterdag'),('2027-12-25','Eerste Kerstdag'),('2027-12-26','Tweede Kerstdag')
on conflict do nothing;

-- contract kinds
alter table public.rider_hr
  add column if not exists contract_kind text not null default 'on_call' check (contract_kind in ('on_call','min_max')),
  add column if not exists min_hours_week numeric, add column if not exists max_hours_week numeric,
  add column if not exists start_date date, add column if not exists reference_days text check (char_length(reference_days) <= 120),
  add column if not exists fixed_offer_at date, add column if not exists offer_alerted_at timestamptz;
alter table public.rider_hr drop constraint if exists rider_hr_kind_hours_check;
alter table public.rider_hr add constraint rider_hr_kind_hours_check check (
  (contract_kind = 'on_call' and min_hours_week is null and max_hours_week is null)
  or (contract_kind = 'min_max' and min_hours_week > 0 and max_hours_week >= min_hours_week and max_hours_week <= 40));
update public.rider_hr set start_date = coalesce(start_date, (select created_at::date from public.profiles p where p.id = profile_id));

-- call-in roster
create table if not exists public.rider_shifts (
  id bigint generated always as identity primary key,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','declined')),
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  cancelled_at timestamptz, note text check (char_length(note) <= 200),
  check (ends_at > starts_at and ends_at - starts_at <= interval '12 hours')
);
create index if not exists rider_shifts_idx on public.rider_shifts(rider_id, starts_at);
alter table public.rider_shifts enable row level security;
revoke all on public.rider_shifts from anon, authenticated;
grant select, insert, update, delete on public.rider_shifts to authenticated;
create policy rs_read on public.rider_shifts for select to authenticated using (rider_id = (select auth.uid()) or (select my_role())::text = 'admin');
create policy rs_admin_ins on public.rider_shifts for insert to authenticated with check ((select my_role())::text = 'admin' and status = 'scheduled');
create policy rs_admin_upd on public.rider_shifts for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin');
create policy rs_admin_del on public.rider_shifts for delete to authenticated using ((select my_role())::text = 'admin' and (starts_at > now() or exists (select 1 from profiles p where p.id = rider_id and p.is_test)));
create or replace function public.fp_shift_status_ts() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then new.cancelled_at := now(); end if;
  return new;
end $$;
drop trigger if exists rider_shifts_ts on public.rider_shifts;
create trigger rider_shifts_ts before update on public.rider_shifts for each row execute function public.fp_shift_status_ts();
-- a rider may decline a call-in that was announced with less than the notice period (art. 7:628a lid 2 BW)
create or replace function public.rider_decline_shift(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare s rider_shifts; nd int;
begin
  select * into s from rider_shifts where id = p_id and rider_id = auth.uid() and status = 'scheduled';
  if not found then raise exception 'not found'; end if;
  select call_notice_days into nd from settings limit 1;
  if s.created_at <= s.starts_at - make_interval(days => nd) then raise exception 'notice period was respected; ask the planner to swap'; end if;
  if s.starts_at <= now() then raise exception 'shift already started'; end if;
  update rider_shifts set status = 'declined' where id = p_id;
end $$;

-- violations: more kinds
alter table public.work_violations drop constraint if exists work_violations_kind_check;
alter table public.work_violations add constraint work_violations_kind_check check (kind in ('max_shift','break','weekly_max','youth_night','rest','avg16w','youth_avg4w','sundays'));

-- rest between shifts: returns when the rider may clock in again, or null
create or replace function public.fp_rest_until(p_rider uuid) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare st settings; s record; rest interval; shift_start timestamptz; last_out timestamptz; prev_in timestamptz;
begin
  select * into st from settings limit 1;
  rest := make_interval(secs => (st.rest_min_h * 3600)::int);
  if exists (select 1 from work_sessions where rider_id = p_rider and clock_out is null) then return null; end if;
  for s in select clock_in, clock_out from work_sessions where rider_id = p_rider and clock_in > now() - interval '48 hours' order by clock_in desc loop
    if last_out is null then last_out := s.clock_out; shift_start := s.clock_in; prev_in := s.clock_in;
    elsif prev_in - s.clock_out >= rest then exit;
    else shift_start := s.clock_in; prev_in := s.clock_in; end if;
  end loop;
  if last_out is null or now() - last_out >= rest then return null; end if;
  -- still inside the same working day (first clock-in less than 24 h - rest ago): split shifts are fine
  if now() - shift_start < interval '24 hours' - rest then return null; end if;
  return last_out + rest;
end $$;

-- readiness: + rest, youth break
create or replace function public.fp_rider_legal_status(p_rider uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare miss text[] := '{}'; st settings; age int; hr_now int; s text; r record; ru timestamptz;
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
  if fp_stretch_minutes(p_rider) >= 60 * (case when age < 18 then least(st.atw_break_after_youth_h, st.atw_break_after_h) else st.atw_break_after_h end) then miss := miss || 'atw_break'::text; end if;
  ru := fp_rest_until(p_rider);
  if ru is not null then miss := miss || ('atw_rest:' || to_char(ru at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')); end if;
  return jsonb_build_object('ready', cardinality(miss) = 0, 'missing', to_jsonb(miss), 'contract_type', 'employment');
end $$;

-- weekly pay: worked + guarantees (3 h per call-in, short-notice cancellations, min-max minimum), surcharges, holiday pay
create or replace function public.fp_rider_week(p_rider uuid, p_week date default (now() at time zone 'Europe/Amsterdam')::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st settings; hr rider_hr; prof profiles; ws date := date_trunc('week', p_week)::date; t0 timestamptz; t1 timestamptz;
  mins numeric; m_sat numeric; m_sun numeric; m_hol numeric; m_night numeric; m_wd numeric; m_ot numeric;
  age int; rate int; kind text; callins int := 0; topup numeric := 0; cancel_paid numeric := 0; minmax_topup numeric := 0;
  wage int; guar int; s_sat int; s_sun int; s_hol int; s_night int; s_ot int; surch int; bonus int; tips int; dels int; hol int; nviol int; shifts int;
  r record; w numeric; three_h boolean; week_done boolean;
begin
  if p_rider is distinct from auth.uid() and coalesce(my_role()::text,'') <> 'admin' and auth.uid() is not null then raise exception 'not allowed'; end if;
  select * into st from settings limit 1;
  select * into prof from profiles where id = p_rider;
  select * into hr from rider_hr where profile_id = p_rider;
  kind := coalesce(hr.contract_kind, 'on_call');
  t0 := ws::timestamp at time zone 'Europe/Amsterdam'; t1 := (ws + 7)::timestamp at time zone 'Europe/Amsterdam';
  week_done := t1 <= now();
  with m as (
    select (g at time zone 'Europe/Amsterdam') l from work_sessions x,
      generate_series(greatest(x.clock_in, t0), least(coalesce(x.clock_out, now()), t1) - interval '1 minute', interval '1 minute') g
    where x.rider_id = p_rider and x.clock_in < t1 and coalesce(x.clock_out, now()) > t0
  ), c as (select l, extract(isodow from l)::int dow, exists (select 1 from public_holidays h where h.day = l::date) is_hol,
                  (l::time >= st.night_from or l::time < st.night_to) night from m)
  select count(*), count(*) filter (where dow = 6 and not is_hol), count(*) filter (where dow = 7 and not is_hol), count(*) filter (where is_hol),
         count(*) filter (where night), count(*) filter (where dow <= 5 and not is_hol)
    into mins, m_sat, m_sun, m_hol, m_night, m_wd from c;
  m_ot := greatest(0, m_wd - 60 * (case when kind = 'min_max' then hr.max_hours_week else st.overtime_week_h end));
  select count(*) into shifts from work_sessions where rider_id = p_rider and clock_in >= t0 and clock_in < t1;
  age := fp_rider_age(p_rider, ws);
  rate := case when age is not null and age < 16 then 0
    else greatest(coalesce((st.wml_cents ->> least(coalesce(age, 21), 21)::text)::int, (st.wml_cents ->> '21')::int),
                  case when st.cao = 'bgv' and coalesce(age, 21) >= 21 then st.cao_scale_cents else 0 end) end;
  three_h := kind = 'on_call' or coalesce(hr.min_hours_week, 0) < 15;
  for r in select * from rider_shifts where rider_id = p_rider and starts_at >= t0 and starts_at < t1 and ends_at <= now() loop
    if r.status = 'scheduled' then
      callins := callins + 1;
      w := fp_worked_minutes(p_rider, r.starts_at - interval '15 minutes', r.ends_at + interval '15 minutes');
      if three_h and w > 0 then topup := topup + greatest(0, 60 * st.min_call_hours - w); end if;
    elsif r.status = 'cancelled' and r.cancelled_at > r.starts_at - make_interval(days => st.call_notice_days) then
      cancel_paid := cancel_paid + extract(epoch from r.ends_at - r.starts_at) / 60;  -- art. 7:628a lid 3 BW
    end if;
  end loop;
  if kind = 'min_max' and week_done then minmax_topup := greatest(0, 60 * hr.min_hours_week - (mins + topup + cancel_paid)); end if;
  wage := round(mins / 60.0 * rate);
  guar := round((topup + cancel_paid + minmax_topup) / 60.0 * rate);
  s_sat := round(m_sat / 60.0 * rate * st.surcharge_sat_pct / 100); s_sun := round(m_sun / 60.0 * rate * st.surcharge_sun_pct / 100);
  s_hol := round(m_hol / 60.0 * rate * st.surcharge_holiday_pct / 100); s_night := round(m_night / 60.0 * rate * st.surcharge_night_pct / 100);
  s_ot := round(m_ot / 60.0 * rate * st.overtime_pct / 100);
  surch := s_sat + s_sun + s_hol + s_night + s_ot;
  select coalesce(sum(amount_cents - coalesce(tip_cents, 0)), 0), coalesce(sum(coalesce(tip_cents, 0)), 0), count(*) into bonus, tips, dels
    from earnings where rider_id = p_rider and earned_at >= t0 and earned_at < t1;
  hol := round((wage + guar + surch + bonus) * st.holiday_pay_pct / 100.0);
  select count(*) into nviol from work_violations where rider_id = p_rider and day >= ws and day < ws + 7;
  return jsonb_build_object('rider_id', p_rider, 'name', prof.full_name, 'email', prof.email, 'is_test', prof.is_test,
    'week_start', ws, 'week_complete', week_done, 'cao', st.cao, 'contract_kind', kind, 'min_hours_week', hr.min_hours_week, 'max_hours_week', hr.max_hours_week,
    'minutes', mins, 'hours', round(mins / 60.0, 2), 'shifts', shifts, 'call_ins', callins,
    'guarantee_callin_hours', round(topup / 60.0, 2), 'guarantee_cancel_hours', round(cancel_paid / 60.0, 2), 'guarantee_minmax_hours', round(minmax_topup / 60.0, 2),
    'paid_hours', round((mins + topup + cancel_paid + minmax_topup) / 60.0, 2),
    'age', age, 'age_known', age is not null, 'wml_rate_cents', rate, 'wage_cents', wage, 'guarantee_cents', guar,
    'sat_hours', round(m_sat / 60.0, 2), 'sun_hours', round(m_sun / 60.0, 2), 'holiday_hours_worked', round(m_hol / 60.0, 2), 'night_hours', round(m_night / 60.0, 2), 'overtime_hours', round(m_ot / 60.0, 2),
    'surcharge_sat_cents', s_sat, 'surcharge_sun_cents', s_sun, 'surcharge_holiday_cents', s_hol, 'surcharge_night_cents', s_night, 'surcharge_overtime_cents', s_ot, 'surcharge_cents', surch,
    'bonus_cents', bonus, 'tips_cents', tips, 'deliveries', dels,
    'holiday_pay_pct', st.holiday_pay_pct, 'holiday_pay_cents', hol, 'holiday_hours', round((mins + topup + cancel_paid + minmax_topup) / 60.0 * st.holiday_hours_pct / 100.0, 2),
    'pension_fund', st.pension_fund, 'pension_employee_pct', st.pension_employee_pct, 'pension_employer_pct', st.pension_employer_pct,
    'gross_cents', wage + guar + surch + bonus + tips + hol, 'violations', nviol, 'indicative', true);
end $$;

-- ATW monitor: + youth break, 16-week avg 48 h, youth 4-week avg 40 h, max 39 Sundays / 52 weeks, fixed-hours offer reminder
create or replace function public.fp_atw_check() returns int language plpgsql security definer set search_path = public as $$
declare st settings; r record; n int := 0; age int; maxs numeric; wmax numeric; dmin numeric; wmin numeric; smin numeric; hr_now int; brk numeric;
  d date := (now() at time zone 'Europe/Amsterdam')::date;
  day0 timestamptz := ((now() at time zone 'Europe/Amsterdam')::date)::timestamp at time zone 'Europe/Amsterdam';
  wk0 timestamptz := (date_trunc('week', now() at time zone 'Europe/Amsterdam'))::timestamp at time zone 'Europe/Amsterdam';
  busy boolean; vid bigint; nm text; sundays int;
begin
  select * into st from settings limit 1;
  update work_sessions w set clock_out = now(), closed_by = 'system' from profiles p where p.id = w.rider_id and w.clock_out is null and not p.online;
  hr_now := extract(hour from now() at time zone 'Europe/Amsterdam')::int;
  for r in select p.id, p.full_name from profiles p where p.role = 'rider' and p.online loop
    nm := coalesce(r.full_name, 'rider');
    age := fp_rider_age(r.id);
    maxs := 60 * case when age < 18 then st.atw_max_shift_youth_h else st.atw_max_shift_h end;
    wmax := 60 * case when age < 18 then st.atw_week_max_youth_h else st.atw_week_max_h end;
    brk := 60 * case when age < 18 then least(st.atw_break_after_youth_h, st.atw_break_after_h) else st.atw_break_after_h end;
    dmin := fp_worked_minutes(r.id, day0, now()); wmin := fp_worked_minutes(r.id, wk0, now()); smin := fp_stretch_minutes(r.id);
    busy := exists (select 1 from orders where rider_id = r.id and status in ('assigned','ready','picked_up'));
    vid := null;
    if smin > brk + 5 then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'break', format('%s min without a 15+ min break (limit %s min)', round(smin), brk))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s worked %s min without a break (limit %s min)', nm, round(smin), brk)); n := n + 1; end if;
    end if;
    vid := null;
    if dmin > maxs then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'max_shift', format('%s min today (limit %s)', round(dmin), maxs))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s exceeded the max shift (%s min, limit %s)%s', nm, round(dmin), maxs, case when busy then '; on a delivery' else '; clocked out' end)); n := n + 1; end if;
      if not busy then update profiles set online = false where id = r.id; end if;
    end if;
    vid := null;
    if wmin > wmax then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'weekly_max', format('%s min this week (limit %s)', round(wmin), wmax))
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s exceeded the weekly max (%s min)', nm, round(wmin))); n := n + 1; end if;
    end if;
    vid := null;
    if fp_worked_minutes(r.id, now() - interval '16 weeks', now()) > 16 * 48 * 60 then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'avg16w', 'average above 48 h/week over 16 weeks') on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s averages > 48 h/week over 16 weeks', nm)); n := n + 1; end if;
    end if;
    vid := null;
    if age is not null and age < 18 and fp_worked_minutes(r.id, now() - interval '4 weeks', now()) > 4 * 40 * 60 then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'youth_avg4w', 'under 18: average above 40 h/week over 4 weeks') on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s (under 18) averages > 40 h/week over 4 weeks', nm)); n := n + 1; end if;
    end if;
    vid := null;
    select count(distinct (clock_in at time zone 'Europe/Amsterdam')::date) into sundays from work_sessions
      where rider_id = r.id and clock_in > now() - interval '52 weeks' and extract(isodow from clock_in at time zone 'Europe/Amsterdam') = 7;
    if sundays > 39 then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'sundays', format('%s Sundays worked in 52 weeks (min 13 free)', sundays)) on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s has fewer than 13 free Sundays in 52 weeks', nm)); n := n + 1; end if;
    end if;
    vid := null;
    if age is not null and age < 18 and (hr_now >= 23 or hr_now < 6) then
      insert into work_violations(rider_id, day, kind, detail) values (r.id, d, 'youth_night', 'online between 23:00 and 06:00 (under 18), clocked out')
      on conflict do nothing returning id into vid;
      if vid is not null then insert into ops_alerts(kind, message) values ('atw', format('ATW: %s (under 18) was online after 23:00, clocked out', nm)); n := n + 1; end if;
      update profiles set online = false where id = r.id;
    end if;
  end loop;
  -- fixed-hours offer after 12 months (art. 7:628a lid 5 BW): alert once
  for r in select h.profile_id, p.full_name from rider_hr h join profiles p on p.id = h.profile_id
           where h.start_date <= current_date - interval '12 months' and h.fixed_offer_at is null and h.offer_alerted_at is null loop
    insert into ops_alerts(kind, message) values ('legal', format('Fixed-hours offer due for %s (12 months employed; offer the average hours of the past 12 months within 1 month)', coalesce(r.full_name, 'rider')));
    update rider_hr set offer_alerted_at = now() where profile_id = r.profile_id; n := n + 1;
  end loop;
  return n;
end $$;

-- average weekly hours over the last 52 weeks (for the fixed-hours offer)
create or replace function public.fp_avg_week_hours(p_rider uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  if p_rider is distinct from auth.uid() and coalesce(my_role()::text,'') <> 'admin' then raise exception 'not allowed'; end if;
  return round(fp_worked_minutes(p_rider, now() - interval '52 weeks', now()) / 60.0 / 52, 1);
end $$;

-- rest status for the admin view
create or replace function public.fp_rest_overview() returns table(rider_id uuid, name text, rest_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return query select p.id, p.full_name, fp_rest_until(p.id) from profiles p where p.role = 'rider' and not p.online and fp_rest_until(p.id) is not null;
end $$;

revoke execute on function public.fp_rest_until(uuid), public.fp_shift_status_ts() from public, anon, authenticated;
revoke execute on function public.rider_decline_shift(bigint), public.fp_avg_week_hours(uuid), public.fp_rest_overview() from public, anon;
grant execute on function public.rider_decline_shift(bigint), public.fp_avg_week_hours(uuid), public.fp_rest_overview() to authenticated;
