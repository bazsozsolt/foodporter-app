-- v17 P3: opening hours per weekday, holiday closures, pause / busy mode. Enforced in create-payment via fp_restaurant_open().
-- opening_hours: {"1":[["11:00","21:30"]], ..., "7":[]}  (ISO weekday 1=Mon; missing key = closed that day; NULL = no hours set = always open)
alter table restaurants add column if not exists opening_hours jsonb;
alter table restaurants add column if not exists closed_dates date[] not null default '{}';
alter table restaurants add column if not exists paused_until timestamptz;
alter table restaurants add column if not exists busy_extra_minutes int not null default 0 check (busy_extra_minutes between 0 and 60);
alter table restaurants add column if not exists hours_test boolean not null default false;

create or replace function public.fp_valid_hours(h jsonb) returns boolean language plpgsql immutable as $$
declare k text; slot jsonb;
begin
  if h is null then return true; end if;
  if jsonb_typeof(h) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(h) loop
    if k !~ '^[1-7]$' or jsonb_typeof(h->k) <> 'array' or jsonb_array_length(h->k) > 3 then return false; end if;
    for slot in select jsonb_array_elements(h->k) loop
      if jsonb_typeof(slot) <> 'array' or jsonb_array_length(slot) <> 2
         or (slot->>0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or (slot->>1) !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         or (slot->>0) >= (slot->>1) then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
alter table restaurants drop constraint if exists restaurants_hours_valid;
alter table restaurants add constraint restaurants_hours_valid check (fp_valid_hours(opening_hours) and cardinality(closed_dates) <= 60);

-- Is the restaurant taking orders at time p_at? (Europe/Amsterdam; pause counts as closed)
create or replace function public.fp_restaurant_open(p_rid uuid, p_at timestamptz default now()) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare r restaurants; loc timestamp; d text; hm text; slot jsonb;
begin
  select * into r from restaurants where id = p_rid;
  if not found then return false; end if;
  if r.paused_until is not null and r.paused_until > p_at and p_at <= now() + interval '1 minute' then return false; end if;
  loc := p_at at time zone 'Europe/Amsterdam';
  if loc::date = any(r.closed_dates) then return false; end if;
  if r.opening_hours is null then return true; end if;
  d := extract(isodow from loc)::int::text; hm := to_char(loc, 'HH24:MI');
  for slot in select jsonb_array_elements(coalesce(r.opening_hours->d, '[]'::jsonb)) loop
    if hm >= slot->>0 and hm < slot->>1 then return true; end if;
  end loop;
  return false;
end $$;
grant execute on function public.fp_restaurant_open(uuid, timestamptz) to anon, authenticated;

-- Seed test hours on test restaurants (marked hours_test), except 't Kaasbolleke which the e2e suite uses around the clock.
update restaurants set opening_hours = '{"1":[["11:00","21:30"]],"2":[["11:00","21:30"]],"3":[["11:00","21:30"]],"4":[["11:00","22:00"]],"5":[["11:00","23:00"]],"6":[["12:00","23:00"]],"7":[["12:00","21:00"]]}'::jsonb,
  hours_test = true
where is_test and opening_hours is null and id <> '187f751c-bebb-4a34-9d4b-9b1a9e8851db';

-- Restaurant staff (own restaurant) and admins change hours / closures / pause / busy through this RPC only.
create or replace function public.restaurant_set_availability(p_rid uuid, p_hours jsonb default null, p_set_hours boolean default false,
  p_closed date[] default null, p_pause_minutes int default null, p_busy int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles; r restaurants;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or not (me.role = 'admin' or (me.role = 'restaurant' and me.restaurant_id = p_rid)) then raise exception 'not allowed'; end if;
  if p_set_hours then
    if not fp_valid_hours(p_hours) then raise exception 'Ongeldige openingstijden'; end if;
    update restaurants set opening_hours = p_hours, hours_test = false where id = p_rid;
  end if;
  if p_closed is not null then
    if cardinality(p_closed) > 60 then raise exception 'Te veel sluitingsdagen'; end if;
    update restaurants set closed_dates = (select coalesce(array_agg(distinct d order by d), '{}') from unnest(p_closed) d where d >= current_date - 1) where id = p_rid;
  end if;
  if p_pause_minutes is not null then
    if p_pause_minutes < 0 or p_pause_minutes > 720 then raise exception 'Pauze tussen 0 en 720 minuten'; end if;
    update restaurants set paused_until = case when p_pause_minutes = 0 then null else now() + make_interval(mins => p_pause_minutes) end where id = p_rid;
  end if;
  if p_busy is not null then
    if p_busy < 0 or p_busy > 60 then raise exception 'Drukte-toeslag tussen 0 en 60 minuten'; end if;
    update restaurants set busy_extra_minutes = p_busy where id = p_rid;
  end if;
  insert into audit_events (type, from_value, to_value, actor) values ('restaurant_availability', p_rid::text,
    concat_ws(' ', case when p_set_hours then 'hours' end, case when p_closed is not null then 'closures' end,
      case when p_pause_minutes is not null then 'pause=' || p_pause_minutes end, case when p_busy is not null then 'busy=' || p_busy end), me.id);
  select * into r from restaurants where id = p_rid;
  return jsonb_build_object('opening_hours', r.opening_hours, 'closed_dates', r.closed_dates, 'paused_until', r.paused_until, 'busy_extra_minutes', r.busy_extra_minutes, 'open_now', fp_restaurant_open(p_rid));
end $$;
revoke all on function public.restaurant_set_availability(uuid, jsonb, boolean, date[], int, int) from public, anon;
grant execute on function public.restaurant_set_availability(uuid, jsonb, boolean, date[], int, int) to authenticated;
grant select (opening_hours, closed_dates, paused_until, busy_extra_minutes, hours_test) on restaurants to anon, authenticated;
