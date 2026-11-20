\set ON_ERROR_STOP on
-- Apply just the stale helper from the migration by re-declaring it (same body as v39).
create or replace function public.fp_assignment_stale(
  p_status order_status,
  p_assigned_at timestamptz,
  p_ready_at timestamptz,
  p_now timestamptz default now()
) returns boolean
language sql stable parallel safe set search_path = public as $$
  select p_status in ('assigned', 'ready')
     and coalesce(p_ready_at, p_assigned_at) is not null
     and coalesce(p_ready_at, p_assigned_at) < p_now - make_interval(mins => coalesce(
       (select stale_assignment_minutes from public.settings limit 1),
       180
     ));
$$;

do $$
declare t0 timestamptz := timestamptz '2026-11-20 22:00:00+01';
begin
  if not public.fp_assignment_stale('assigned', t0 - interval '4 hours', null, t0) then raise exception 'assigned 4h should be stale'; end if;
  if public.fp_assignment_stale('assigned', t0 - interval '2 hours', null, t0) then raise exception 'assigned 2h should not be stale'; end if;
  if public.fp_assignment_stale('assigned', t0 - interval '3 hours', null, t0) then raise exception 'exactly 3h should not be stale'; end if;
  if not public.fp_assignment_stale('ready', t0 - interval '8 hours', t0 - interval '4 hours', t0) then raise exception 'ready 4h should be stale'; end if;
  if public.fp_assignment_stale('ready', t0 - interval '8 hours', t0 - interval '1 hour', t0) then raise exception 'ready 1h should not be stale'; end if;
  if public.fp_assignment_stale('picked_up', t0 - interval '6 hours', t0 - interval '5 hours', t0) then raise exception 'picked_up should not be stale'; end if;
  if public.fp_assignment_stale('delivered', t0 - interval '8 hours', t0 - interval '7 hours', t0) then raise exception 'delivered should not be stale'; end if;
  if public.fp_assignment_stale('assigned', null, null, t0) then raise exception 'missing timestamps should not be stale'; end if;
end $$;

insert into public.orders(id, rider_id, status, assigned_at, ready_at) values
  (2007, '00000000-0000-4000-8000-000000000001', 'assigned', timestamptz '2026-10-18 12:00:00+02', null),
  (2257, '00000000-0000-4000-8000-000000000001', 'assigned', timestamptz '2026-11-20 22:13:00+01', null),
  (3001, '00000000-0000-4000-8000-000000000001', 'picked_up', timestamptz '2026-11-20 20:00:00+01', timestamptz '2026-11-20 20:10:00+01');

-- Busy count used for stacking / ETA must ignore stale #2007 but still count a fresh assignment and a picked-up job.
do $$
declare n int;
begin
  select count(*) into n from public.orders
    where rider_id = '00000000-0000-4000-8000-000000000001'
      and status in ('assigned', 'ready', 'picked_up')
      and not fp_assignment_stale(status, assigned_at, ready_at, timestamptz '2026-11-20 23:00:00+01');
  if n <> 2 then raise exception 'expected 2 non-stale active jobs, got %', n; end if;
  if not fp_assignment_stale('assigned', timestamptz '2026-10-18 12:00:00+02', null, timestamptz '2026-11-20 23:00:00+01') then
    raise exception 'order 2007 shaped row should be stale in November';
  end if;
end $$;


-- The admin setting shortens or lengthens the window.
do $$
declare t0 timestamptz := timestamptz '2026-11-20 22:00:00+01';
begin
  update public.settings set stale_assignment_minutes = 120;
  if not public.fp_assignment_stale('assigned', t0 - interval '150 minutes', null, t0) then
    raise exception 'at 120 minutes, 2.5h should be stale';
  end if;
  if public.fp_assignment_stale('assigned', t0 - interval '90 minutes', null, t0) then
    raise exception 'at 120 minutes, 1.5h should not be stale';
  end if;
  update public.settings set stale_assignment_minutes = 180;
  if public.fp_assignment_stale('assigned', t0 - interval '150 minutes', null, t0) then
    raise exception 'after restore to 180, 2.5h should not be stale';
  end if;
end $$;

-- Allowed range is 30–1440.
do $$
begin
  update public.settings set stale_assignment_minutes = 30;
  update public.settings set stale_assignment_minutes = 1440;
  begin
    update public.settings set stale_assignment_minutes = 29;
    raise exception '29 minutes should be rejected';
  exception when check_violation then null;
  end;
  begin
    update public.settings set stale_assignment_minutes = 1441;
    raise exception '1441 minutes should be rejected';
  exception when check_violation then null;
  end;
  update public.settings set stale_assignment_minutes = 180;
end $$;

\echo e2e-round1 sql: all assertions passed
