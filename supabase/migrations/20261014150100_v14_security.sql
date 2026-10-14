-- v14 security re-audit fixes
-- 1) No client role needs TRUNCATE/TRIGGER/REFERENCES on any public table (TRUNCATE ignores RLS).
do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','m','p') loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
-- 2) Report views are read-only for clients (security_invoker already applies RLS underneath).
revoke insert, update, delete on public.order_metrics, public.order_facts from anon, authenticated;
revoke all on public.order_metrics, public.order_facts from anon;
-- 3) The masked-call proxy number must not sit in the anon-readable settings row: move it to a private table.
create table if not exists public.call_config (id boolean primary key default true check (id), masked_number text);
alter table public.call_config enable row level security;
revoke all on public.call_config from anon, authenticated;
insert into public.call_config(id, masked_number) select true, call_masked_number from public.settings limit 1 on conflict (id) do nothing;
alter table public.settings drop column if exists call_masked_number;
create or replace function order_call(p_order bigint, p_target text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; side text; target text; num text; prov text;
begin
  if auth.uid() is null then raise exception 'Je bent niet ingelogd'; end if;
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  side := case when o.customer_id = auth.uid() then 'customer' when o.rider_id = auth.uid() then 'rider' when (select my_role()) = 'admin' then 'admin' end;
  if side is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  target := case side when 'customer' then 'rider' when 'rider' then 'customer' else p_target end;
  if target is null or target not in ('rider','customer') then raise exception 'Kies wie je wilt bellen'; end if;
  if o.rider_id is null or o.status not in ('assigned','ready','picked_up') then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  select call_provider into prov from settings limit 1;
  if prov = 'off' then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  perform fp_rate_limit('order_call', 10, interval '1 hour');
  if prov = 'masked' then select masked_number into num from call_config limit 1;
  elsif target = 'rider' then select phone into num from profiles where id = o.rider_id;
  else num := o.phone; end if;
  num := nullif(regexp_replace(coalesce(num, ''), '[^0-9+]', '', 'g'), '');
  if num is null then raise exception 'Geen telefoonnummer beschikbaar'; end if;
  insert into call_audit(order_id, caller_id, caller_role, callee_role, provider) values (p_order, auth.uid(), side, target, prov);
  return jsonb_build_object('provider', prov, 'number', num);
end $$;
revoke execute on function order_call(bigint, text) from public, anon;
grant execute on function order_call(bigint, text) to authenticated;
-- 4) helper functions anon never needs
revoke execute on function public.fp_menu_photo_url(text) from public, anon;
