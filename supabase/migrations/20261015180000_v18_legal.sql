-- v18 HR & Legal: template library, contract requests, immutable e-sign log, rider documents/onboarding, gates.
create table if not exists public.legal_templates (
  id text not null, version text not null, title text not null,
  audience text not null check (audience in ('rider','restaurant','customer','all','internal')),
  effective_date date not null default current_date,
  pdf_path text not null, html_path text not null, sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  requires_acceptance boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (id, version)
);
create table if not exists public.legal_acceptances (
  id bigint generated always as identity primary key,
  template_id text not null, version text not null,
  profile_id uuid not null, restaurant_id uuid,
  accepted_at timestamptz not null default now(),
  ip inet, user_agent text, lang text check (lang in ('nl','en')),
  text_sha256 text not null,
  method text not null default 'click' check (method in ('click','test_seed')),
  foreign key (template_id, version) references public.legal_templates(id, version)
);
create index if not exists legal_acc_profile on public.legal_acceptances(profile_id, template_id);
create index if not exists legal_acc_rest on public.legal_acceptances(restaurant_id, template_id);
create table if not exists public.legal_requests (
  id bigint generated always as identity primary key,
  template_id text not null, version text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent','signed','expired','revoked')),
  sent_at timestamptz not null default now(), sent_by uuid default auth.uid(),
  due_at timestamptz not null default now() + interval '14 days',
  signed_at timestamptz, acceptance_id bigint references public.legal_acceptances(id),
  check ((profile_id is null) <> (restaurant_id is null)),
  foreign key (template_id, version) references public.legal_templates(id, version)
);
create index if not exists legal_req_open on public.legal_requests(profile_id, restaurant_id) where status in ('sent','expired');
create table if not exists public.rider_hr (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  contract_type text not null default 'employment' check (contract_type in ('employment','zzp')),
  birthdate date, updated_at timestamptz not null default now()
);
create table if not exists public.rider_documents (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('id','right_to_work','kvk','licence','insurance')),
  expires_on date, verified_at timestamptz, verified_by uuid, reminded_at timestamptz,
  primary key (profile_id, kind)
);
create table if not exists public.rider_onboarding (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  step text not null check (step in ('id_checked','right_to_work','age_checked','kvk_checked','iban','safety_briefing','licence','test_ride')),
  done_at timestamptz not null default now(), done_by uuid default auth.uid(), note text check (char_length(note) <= 200),
  primary key (profile_id, step)
);

-- immutable acceptance log
create or replace function public.fp_legal_immutable() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'legal_acceptances is append-only'; end $$;
drop trigger if exists legal_acc_immutable on public.legal_acceptances;
create trigger legal_acc_immutable before update or delete on public.legal_acceptances for each row execute function public.fp_legal_immutable();
drop trigger if exists legal_acc_no_truncate on public.legal_acceptances;
create trigger legal_acc_no_truncate before truncate on public.legal_acceptances for each statement execute function public.fp_legal_immutable();

create or replace function public.fp_doc_reset_reminder() returns trigger language plpgsql set search_path = public as $$
begin if new.expires_on is distinct from old.expires_on then new.reminded_at := null; end if; return new; end $$;
drop trigger if exists rider_docs_reset on public.rider_documents;
create trigger rider_docs_reset before update on public.rider_documents for each row execute function public.fp_doc_reset_reminder();

-- RLS
alter table public.legal_templates enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.legal_requests enable row level security;
alter table public.rider_hr enable row level security;
alter table public.rider_documents enable row level security;
alter table public.rider_onboarding enable row level security;
revoke all on public.legal_templates, public.legal_acceptances, public.legal_requests, public.rider_hr, public.rider_documents, public.rider_onboarding from anon, authenticated;
grant select on public.legal_templates to anon, authenticated;
grant insert, update on public.legal_templates to authenticated;
grant select on public.legal_acceptances to authenticated;
grant select, insert, update on public.legal_requests to authenticated;
grant select, insert, update, delete on public.rider_hr, public.rider_documents, public.rider_onboarding to authenticated;

create policy legal_tpl_read on public.legal_templates for select to anon, authenticated using (audience <> 'internal' or (select my_role())::text = 'admin');
create policy legal_tpl_admin_ins on public.legal_templates for insert to authenticated with check ((select my_role())::text = 'admin');
create policy legal_tpl_admin_upd on public.legal_templates for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin');
create policy legal_acc_read on public.legal_acceptances for select to authenticated using (
  profile_id = (select auth.uid()) or (restaurant_id is not null and restaurant_id = (select my_restaurant())) or (select my_role())::text = 'admin');
create policy legal_req_read on public.legal_requests for select to authenticated using (
  profile_id = (select auth.uid()) or (restaurant_id is not null and restaurant_id = (select my_restaurant())) or (select my_role())::text = 'admin');
create policy legal_req_admin_ins on public.legal_requests for insert to authenticated with check ((select my_role())::text = 'admin' and status = 'sent');
create policy legal_req_admin_upd on public.legal_requests for update to authenticated using ((select my_role())::text = 'admin') with check ((select my_role())::text = 'admin' and status in ('sent','revoked','expired'));
do $$ declare t text; begin
  foreach t in array array['rider_hr','rider_documents','rider_onboarding'] loop
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (profile_id = (select auth.uid()) or (select my_role())::text = ''admin'')', t);
    execute format('create policy %1$s_admin_ins on public.%1$s for insert to authenticated with check ((select my_role())::text = ''admin'')', t);
    execute format('create policy %1$s_admin_upd on public.%1$s for update to authenticated using ((select my_role())::text = ''admin'') with check ((select my_role())::text = ''admin'')', t);
    execute format('create policy %1$s_admin_del on public.%1$s for delete to authenticated using ((select my_role())::text = ''admin'')', t);
  end loop; end $$;

-- current version of a template
create or replace function public.fp_legal_current(p_id text) returns public.legal_templates
language sql stable security definer set search_path = public as $$
  select * from legal_templates where id = p_id and effective_date <= current_date
  order by effective_date desc, created_at desc limit 1 $$;

create or replace function public.fp_has_accepted(p_template text, p_profile uuid, p_restaurant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from legal_acceptances a where a.template_id = p_template
    and a.version = (public.fp_legal_current(p_template)).version
    and ((p_restaurant is null and a.profile_id = p_profile) or (p_restaurant is not null and a.restaurant_id = p_restaurant))) $$;

create or replace function public.fp_rider_legal_status(p_rider uuid default auth.uid())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare miss text[] := '{}'; hr rider_hr; ctype text; age int; hr_now int; s text; r record;
begin
  if p_rider is distinct from auth.uid() and coalesce(my_role()::text,'') <> 'admin' and auth.uid() is not null then
    raise exception 'not allowed';
  end if;
  select * into hr from rider_hr where profile_id = p_rider;
  ctype := coalesce(hr.contract_type, 'employment');
  if not fp_has_accepted(case ctype when 'zzp' then 'rider_zzp' else 'rider_employment' end, p_rider, null) then miss := miss || 'contract'::text; end if;
  if not fp_has_accepted('rider_conduct', p_rider, null) then miss := miss || 'conduct'::text; end if;
  if not fp_has_accepted('platform_transparency', p_rider, null) then miss := miss || 'transparency'::text; end if;
  for r in select template_id from legal_requests where profile_id = p_rider and status in ('sent','expired') loop
    miss := miss || ('pending:' || r.template_id);
  end loop;
  foreach s in array (array['id_checked','right_to_work','age_checked','iban','safety_briefing'] || case when ctype = 'zzp' then array['kvk_checked'] else '{}'::text[] end) loop
    if not exists (select 1 from rider_onboarding where profile_id = p_rider and step = s) then miss := miss || ('step:' || s); end if;
  end loop;
  for r in select kind from rider_documents where profile_id = p_rider and expires_on < current_date
           and kind in ('id','right_to_work','kvk') and (kind <> 'kvk' or ctype = 'zzp') loop
    miss := miss || ('doc_expired:' || r.kind);
  end loop;
  if hr.birthdate is not null then
    age := extract(year from age((now() at time zone 'Europe/Amsterdam')::date, hr.birthdate))::int;
    hr_now := extract(hour from now() at time zone 'Europe/Amsterdam')::int;
    if age < 16 then miss := miss || 'age_under_16'::text;
    elsif age < 18 and (hr_now >= 23 or hr_now < 6) then miss := miss || 'youth_night'::text; end if;
  end if;
  return jsonb_build_object('ready', cardinality(miss) = 0, 'missing', to_jsonb(miss), 'contract_type', ctype);
end $$;

create or replace function public.fp_restaurant_legal_status(p_rid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare miss text[] := '{}'; r record;
begin
  if not exists (select 1 from profiles where restaurant_id = p_rid and role = 'restaurant') then
    return jsonb_build_object('ready', true, 'gated', false, 'missing', '[]'::jsonb);
  end if;
  if not fp_has_accepted('restaurant_partner', null, p_rid) then miss := miss || 'restaurant_partner'::text; end if;
  if not fp_has_accepted('dpa_restaurant', null, p_rid) then miss := miss || 'dpa_restaurant'::text; end if;
  for r in select template_id from legal_requests where restaurant_id = p_rid and status in ('sent','expired') loop
    miss := miss || ('pending:' || r.template_id);
  end loop;
  return jsonb_build_object('ready', cardinality(miss) = 0, 'gated', true, 'missing', to_jsonb(miss));
end $$;

create or replace function public.my_legal_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rl text := my_role()::text;
begin
  if rl = 'rider' then return fp_rider_legal_status(auth.uid()); end if;
  if rl = 'restaurant' and my_restaurant() is not null then return fp_restaurant_legal_status(my_restaurant()); end if;
  return jsonb_build_object('ready', true, 'missing', '[]'::jsonb);
end $$;

-- e-sign
create or replace function public.legal_accept(p_template text, p_sha256 text, p_lang text default 'nl')
returns bigint language plpgsql security definer set search_path = public as $$
declare t legal_templates; rl text := my_role()::text; rid uuid; hdr json; ipt text; ip inet; aid bigint;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  t := fp_legal_current(p_template);
  if t.id is null or not t.requires_acceptance then raise exception 'unknown template'; end if;
  if t.sha256 <> coalesce(p_sha256, '') then raise exception 'document version changed, reload'; end if;
  if t.audience = 'rider' and rl <> 'rider' then raise exception 'not allowed'; end if;
  if t.audience = 'restaurant' then
    if rl <> 'restaurant' or my_restaurant() is null then raise exception 'not allowed'; end if;
    rid := my_restaurant();
  end if;
  -- reuse an existing signature for the same version, unless an admin explicitly asked for a (re-)signature
  if not exists (select 1 from legal_requests where template_id = t.id and status in ('sent','expired')
                 and ((rid is null and profile_id = auth.uid()) or (rid is not null and restaurant_id = rid))) then
    select id into aid from legal_acceptances where template_id = t.id and version = t.version
      and profile_id = auth.uid() and restaurant_id is not distinct from rid order by accepted_at desc, id desc limit 1;
  end if;
  if aid is null then
    hdr := nullif(current_setting('request.headers', true), '')::json;
    ipt := trim(split_part(coalesce(hdr->>'x-forwarded-for', hdr->>'x-real-ip', ''), ',', 1));
    begin ip := nullif(ipt, '')::inet; exception when others then ip := null; end;
    insert into legal_acceptances(template_id, version, profile_id, restaurant_id, ip, user_agent, lang, text_sha256)
    values (t.id, t.version, auth.uid(), rid, ip, left(hdr->>'user-agent', 300),
            case when p_lang in ('nl','en') then p_lang else 'nl' end, t.sha256)
    returning id into aid;
  end if;
  update legal_requests set status = 'signed', signed_at = now(), acceptance_id = aid
   where template_id = t.id and status in ('sent','expired')
     and ((rid is null and profile_id = auth.uid()) or (rid is not null and restaurant_id = rid));
  return aid;
end $$;

-- gates
create or replace function public.fp_rider_online_gate() returns trigger language plpgsql security definer set search_path = public as $$
declare st jsonb;
begin
  if new.online and not coalesce(old.online, false) and new.role = 'rider' then
    st := fp_rider_legal_status(new.id);
    if not (st->>'ready')::boolean then
      raise exception 'legal: onboarding incomplete (%)', array_to_string(array(select jsonb_array_elements_text(st->'missing')), ', ');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_legal_gate on public.profiles;
create trigger profiles_legal_gate before update of online on public.profiles for each row execute function public.fp_rider_online_gate();

CREATE OR REPLACE FUNCTION public.fp_restaurant_open(p_rid uuid, p_at timestamp with time zone DEFAULT now())
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r restaurants; loc timestamp; d text; hm text; slot jsonb;
begin
  select * into r from restaurants where id = p_rid;
  if not found then return false; end if;
  if not (fp_restaurant_legal_status(p_rid)->>'ready')::boolean then return false; end if;
  if r.paused_until is not null and r.paused_until > p_at and p_at <= now() + interval '1 minute' then return false; end if;
  loc := p_at at time zone 'Europe/Amsterdam';
  if loc::date = any(r.closed_dates) then return false; end if;
  if r.opening_hours is null then return true; end if;
  d := extract(isodow from loc)::int::text; hm := to_char(loc, 'HH24:MI');
  for slot in select jsonb_array_elements(coalesce(r.opening_hours->d, '[]'::jsonb)) loop
    if hm >= slot->>0 and hm < slot->>1 then return true; end if;
  end loop;
  return false;
end $function$;

-- reminders / housekeeping
alter table public.ops_alerts drop constraint if exists ops_alerts_kind_check;
alter table public.ops_alerts add constraint ops_alerts_kind_check check (kind = any (array['restaurant_timeout','no_bid','refund_failed','out_of_zone','late_payment','other','sos','doc_expiry','legal']));

create or replace function public.fp_legal_housekeeping() returns int language plpgsql security definer set search_path = public as $$
declare n int := 0; d record;
begin
  update legal_requests set status = 'expired' where status = 'sent' and due_at < now();
  for d in select rd.profile_id, rd.kind, rd.expires_on, p.full_name from rider_documents rd join profiles p on p.id = rd.profile_id
           where rd.expires_on is not null and rd.expires_on <= current_date + 30 and rd.reminded_at is null loop
    insert into ops_alerts(kind, message) values ('doc_expiry',
      format('Rider %s: %s document %s on %s', coalesce(d.full_name, left(d.profile_id::text, 8)), d.kind,
             case when d.expires_on < current_date then 'expired' else 'expires' end, d.expires_on));
    update rider_documents set reminded_at = now() where profile_id = d.profile_id and kind = d.kind;
    n := n + 1;
  end loop;
  -- minors (16-17) may not work 23:00-06:00 (ATW youth rules)
  update profiles p set online = false from rider_hr h
   where h.profile_id = p.id and p.online and h.birthdate is not null
     and extract(year from age((now() at time zone 'Europe/Amsterdam')::date, h.birthdate)) < 18
     and (extract(hour from now() at time zone 'Europe/Amsterdam') >= 23 or extract(hour from now() at time zone 'Europe/Amsterdam') < 6);
  return n;
end $$;
select cron.schedule('fp-legal', '*/10 * * * *', 'select public.fp_legal_housekeeping()');

revoke execute on function public.fp_legal_immutable(), public.fp_doc_reset_reminder(), public.fp_rider_online_gate(), public.fp_legal_housekeeping(),
  public.fp_legal_current(text), public.fp_has_accepted(text, uuid, uuid), public.fp_restaurant_legal_status(uuid) from public, anon, authenticated;
revoke execute on function public.fp_rider_legal_status(uuid), public.my_legal_status(), public.legal_accept(text, text, text) from public, anon;
grant execute on function public.fp_rider_legal_status(uuid), public.my_legal_status(), public.legal_accept(text, text, text) to authenticated;

-- seed library v0.1
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('rider_zzp','0.1','Overeenkomst van opdracht bezorger (zzp)','rider',date '2026-10-15','legal/rider_zzp-v0.1.pdf','legal/rider_zzp.html','2aef40ec4458fced75de3c06a4e1b2c9eaa18113de7fe8c0dc588a674130b200',true),
('rider_employment','0.1','Arbeidsovereenkomst bezorger (oproep / min-max)','rider',date '2026-10-15','legal/rider_employment-v0.1.pdf','legal/rider_employment.html','3a7cf2a3e2d8ce1bdfe672dc8470a00fac5580cb85ad5010fc429002423168e2',true),
('restaurant_partner','0.1','Partnerovereenkomst restaurant','restaurant',date '2026-10-15','legal/restaurant_partner-v0.1.pdf','legal/restaurant_partner.html','b8c63566081706d54bb7952004307c5a03ec7063b457819b30c3a6460fc5f0e6',true),
('customer_terms','0.1','Algemene voorwaarden klanten','customer',date '2026-10-15','legal/customer_terms-v0.1.pdf','legal/customer_terms.html','29e1209535854cc0b50194f4e10fb52d2c1f30b58e8884ffa478c226836acc2c',false),
('privacy_statement','0.1','Privacyverklaring (update v18)','all',date '2026-10-15','legal/privacy_statement-v0.1.pdf','legal/privacy_statement.html','27e50c78d97205301b9f73c83af086b74a98d16dc7ed135767f0e71b3965efcd',false),
('dpa_restaurant','0.1','Verwerkersovereenkomst (DPA) restaurant + subverwerkers','restaurant',date '2026-10-15','legal/dpa_restaurant-v0.1.pdf','legal/dpa_restaurant.html','060893a8c0cb47c727ddeb790f4b5e8b40d6414a1ea2e6f3ca060bfdc0b33352',true),
('rider_conduct','0.1','Gedragscode bezorgers en veiligheids- en ongevallenprocedure','rider',date '2026-10-15','legal/rider_conduct-v0.1.pdf','legal/rider_conduct.html','8e5516ba76bb2277d6e26951121346d8aaa1e7035bd1dddab21436bf27929a3c',true),
('platform_transparency','0.1','Transparantieverklaring algoritmisch management (richtlijn 2024/2831)','rider',date '2026-10-15','legal/platform_transparency-v0.1.pdf','legal/platform_transparency.html','a7f8e481a54c601b14d3876ebfdd5cc0178f3b48efa89c95af833e6c27915c46',true),
('dpia_gps','0.1','DPIA-opzet GPS-tracking bezorgers','internal',date '2026-10-15','legal/dpia_gps-v0.1.pdf','legal/dpia_gps.html','84463b885dfd01b8847a5699a0a83601f673954814031364be2b188f5f21336f',false),
('processing_register','0.1','Register van verwerkingsactiviteiten (art. 30 AVG)','internal',date '2026-10-15','legal/processing_register-v0.1.pdf','legal/processing_register.html','a6061616c112fab32e66775fec221617a33441ab43edc85f4fbde033b85e4511',false),
('rider_onboarding','0.1','Onboardingchecklist bezorger','internal',date '2026-10-15','legal/rider_onboarding-v0.1.pdf','legal/rider_onboarding.html','5fbdc001a97e741a9a9c125b80a5418dd0ae2d71fbc7810c026794f1c924408a',false),
('deactivation_appeal','0.1','Deactivatie-, bezwaar- en klachtenprocedure','all',date '2026-10-15','legal/deactivation_appeal-v0.1.pdf','legal/deactivation_appeal.html','4f9e5ed4bc549f905e5fdc7207366f8500f90f192e64e39bbf18d59cbeadbfd2',false)
on conflict (id, version) do update set sha256 = excluded.sha256, title = excluded.title, pdf_path = excluded.pdf_path, html_path = excluded.html_path;

-- test accounts only: seed signatures + onboarding so existing test flows keep working
insert into public.rider_hr(profile_id) select id from public.profiles where role = 'rider' and is_test on conflict do nothing;
insert into public.rider_onboarding(profile_id, step, done_by, note)
select p.id, s, null, 'test seed' from public.profiles p cross join unnest(array['id_checked','right_to_work','age_checked','iban','safety_briefing']) s
where p.role = 'rider' and p.is_test on conflict do nothing;
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'rider' and p.is_test and t.id in ('rider_employment','rider_conduct','platform_transparency') and t.version = '0.1';
insert into public.legal_acceptances(template_id, version, profile_id, restaurant_id, lang, text_sha256, method)
select t.id, t.version, p.id, p.restaurant_id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'restaurant' and p.is_test and p.restaurant_id is not null and t.id in ('restaurant_partner','dpa_restaurant') and t.version = '0.1';

-- (applied separately as v18_legal_tpl_policy) anon cannot execute my_role(): split the read policy
drop policy if exists legal_tpl_read on public.legal_templates;
create policy legal_tpl_read on public.legal_templates for select to anon, authenticated using (audience <> 'internal');
create policy legal_tpl_admin_read on public.legal_templates for select to authenticated using ((select my_role())::text = 'admin');
