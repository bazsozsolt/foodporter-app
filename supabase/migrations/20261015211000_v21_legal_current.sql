-- v21: one unambiguous "current version" per template.
-- Order: effective_date (≤ today) desc, then numeric version desc. Versions must increase and may not be back-dated,
-- so the two keys never disagree; created_at is no longer used as a tiebreak.
alter table public.legal_templates add column if not exists version_key int[]
  generated always as (string_to_array(version, '.')::int[]) stored;
alter table public.legal_templates drop constraint if exists legal_templates_version_fmt;
alter table public.legal_templates add constraint legal_templates_version_fmt check (version ~ '^[0-9]+(\.[0-9]+)*$');

create or replace function public.fp_legal_tpl_guard() returns trigger language plpgsql set search_path = public as $$
declare mk int[]; me date;
begin
  select max(version_key), max(effective_date) into mk, me from legal_templates where id = new.id and version <> new.version;
  if mk is not null and string_to_array(new.version, '.')::int[] <= mk then raise exception 'legal template %: version % must be higher than %', new.id, new.version, array_to_string(mk, '.'); end if;
  if me is not null and new.effective_date < me then raise exception 'legal template %: effective date % is before the current %', new.id, new.effective_date, me; end if;
  return new;
end $$;
drop trigger if exists legal_tpl_guard on public.legal_templates;
create trigger legal_tpl_guard before insert on public.legal_templates for each row execute function public.fp_legal_tpl_guard();
revoke execute on function public.fp_legal_tpl_guard() from public, anon, authenticated;

create or replace function public.fp_legal_current(p_id text) returns legal_templates
language sql stable security definer set search_path = public as $$
  select * from legal_templates where id = p_id and effective_date <= current_date order by effective_date desc, version_key desc limit 1
$$;

create or replace view public.legal_templates_current with (security_invoker = true) as
  select distinct on (id) * from public.legal_templates where effective_date <= current_date order by id, effective_date desc, version_key desc;
grant select on public.legal_templates_current to anon, authenticated;
