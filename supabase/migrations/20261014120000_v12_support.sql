alter table public.ops_alerts drop constraint if exists ops_alerts_kind_check;
alter table public.ops_alerts add constraint ops_alerts_kind_check check (kind = any (array['restaurant_timeout','no_bid','refund_failed','out_of_zone','late_payment','other','sos']));
-- Support system: tickets + message thread, RPC-only writes, strict RLS (each party sees only their own tickets,
-- admins see all, internal admin notes are never visible to users), private photo bucket, SLA, rate limits.
create table if not exists public.support_tickets (
  id bigserial primary key,
  order_id bigint references public.orders(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('customer', 'restaurant', 'rider')),
  category text not null check (category in (
    'late', 'missing_item', 'wrong_item', 'damaged', 'rider_issue', 'payment', 'refund', 'other',             -- customer
    'rider_problem', 'order_problem', 'help', 'item_unavailable',                                             -- restaurant
    'address_not_found', 'customer_unreachable', 'restaurant_delay', 'accident', 'safety', 'sos', 'payout')), -- rider
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'waiting_user', 'resolved')),
  subject text not null check (char_length(subject) between 1 and 140),
  assigned_to uuid references public.profiles(id) on delete set null,
  refund_requested_cents int check (refund_requested_cents is null or refund_requested_cents > 0),
  refund_status text, refund_cents int, refund_id text,
  lat double precision, lng double precision,
  sla_due_at timestamptz not null,
  first_response_at timestamptz, resolved_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  is_test boolean not null default false
);
create index if not exists support_tickets_owner on public.support_tickets(created_by, created_at desc);
create index if not exists support_tickets_inbox on public.support_tickets(status, priority, sla_due_at);
create index if not exists support_tickets_order on public.support_tickets(order_id);

create table if not exists public.support_messages (
  id bigserial primary key,
  ticket_id bigint not null references public.support_tickets(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  author_role text not null check (author_role in ('customer', 'restaurant', 'rider', 'admin', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-zA-Z_-]{8,64}\.(jpg|jpeg|png|webp)$'),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket on public.support_messages(ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
create policy "tickets visible to owner or admin" on public.support_tickets for select to authenticated
  using (created_by = (select auth.uid()) or (select my_role()) = 'admin');
create policy "messages visible to owner or admin" on public.support_messages for select to authenticated
  using ((select my_role()) = 'admin'
         or (not internal and exists (select 1 from support_tickets t where t.id = ticket_id and t.created_by = (select auth.uid()))));
alter table public.support_tickets replica identity default;
alter table public.support_messages replica identity default;
do $$ begin
  begin alter publication supabase_realtime add table public.support_tickets; exception when others then null; end;
  begin alter publication supabase_realtime add table public.support_messages; exception when others then null; end;
end $$;

-- Private photo bucket: users upload into their own folder, 5 MB images only; owner or admin can read (signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-photos', 'support-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "support photos upload own folder" on storage.objects;
create policy "support photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'support-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "support photos read own or admin" on storage.objects;
create policy "support photos read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'support-photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.my_role()) = 'admin'));

create or replace function public.fp_ticket_sla(p_priority text) returns interval language sql immutable as $$
  select case p_priority when 'urgent' then interval '10 minutes' when 'high' then interval '1 hour' when 'normal' then interval '4 hours' else interval '24 hours' end $$;

-- Create a ticket (optionally tied to an order the caller is part of) with its first message.
create or replace function public.support_create(p_category text, p_body text, p_order bigint default null,
  p_refund_cents int default null, p_photo_path text default null, p_lat double precision default null, p_lng double precision default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare me profiles; o orders; r text; pr text; subj text; tid bigint; total int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'not signed in'; end if;
  r := case when me.role in ('customer', 'restaurant', 'rider') then me.role::text when me.role = 'admin' then 'customer' end;
  if r is null then raise exception 'role not allowed'; end if;
  if (r = 'customer' and p_category not in ('late','missing_item','wrong_item','damaged','rider_issue','payment','refund','other'))
     or (r = 'restaurant' and p_category not in ('rider_problem','order_problem','help','item_unavailable','other'))
     or (r = 'rider' and p_category not in ('address_not_found','customer_unreachable','restaurant_delay','accident','safety','sos','payout','other')) then
    raise exception 'Onbekende categorie voor jouw rol';
  end if;
  perform fp_rate_limit(case when p_category = 'sos' then 'support_sos' else 'support_create' end, case when p_category = 'sos' then 5 else 6 end, interval '1 hour');
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 3 then raise exception 'Beschrijf het probleem in een paar woorden'; end if;
  if char_length(p_body) > 2000 then raise exception 'Bericht is te lang (max 2000 tekens)'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then raise exception 'invalid photo'; end if;
  if p_order is not null then
    select * into o from orders where id = p_order;
    if o.id is null or not ((r = 'customer' and o.customer_id = me.id) or (r = 'restaurant' and o.restaurant_id = me.restaurant_id) or (r = 'rider' and o.rider_id = me.id) or me.role = 'admin') then
      raise exception 'Deze bestelling hoort niet bij jouw account';
    end if;
  elsif p_category in ('late','missing_item','wrong_item','damaged','item_unavailable','customer_unreachable','address_not_found') then
    raise exception 'Kies de bestelling waar het om gaat';
  end if;
  if p_refund_cents is not null then
    if p_order is null or o.paid_at is null then raise exception 'Terugbetaling kan alleen voor een betaalde bestelling'; end if;
    total := coalesce(o.subtotal_cents, 0) + coalesce(o.delivery_fee_cents, 0) - coalesce(o.refund_cents, 0);
    if p_refund_cents <= 0 or p_refund_cents > total then raise exception 'Bedrag is hoger dan wat je betaald hebt'; end if;
  end if;
  pr := case when p_category in ('sos', 'accident') then 'urgent'
             when p_category in ('safety', 'rider_issue', 'rider_problem', 'customer_unreachable', 'address_not_found', 'late') then 'high'
             when p_category in ('payout', 'help', 'other') then 'low' else 'normal' end;
  subj := case p_category
    when 'late' then 'Bestelling te laat' when 'missing_item' then 'Item ontbreekt' when 'wrong_item' then 'Verkeerd item'
    when 'damaged' then 'Beschadigd / gemorst' when 'rider_issue' then 'Probleem met bezorger' when 'payment' then 'Betaling'
    when 'refund' then 'Terugbetaling' when 'rider_problem' then 'Probleem met bezorger' when 'order_problem' then 'Probleem met bestelling'
    when 'help' then 'Hulp gevraagd' when 'item_unavailable' then 'Item niet beschikbaar' when 'address_not_found' then 'Adres niet te vinden'
    when 'customer_unreachable' then 'Klant onbereikbaar' when 'restaurant_delay' then 'Vertraging restaurant' when 'accident' then 'Ongeval'
    when 'safety' then 'Veiligheid' when 'sos' then 'SOS' when 'payout' then 'Vraag over uitbetaling' else 'Overig' end
    || coalesce(' · #' || p_order, '');
  insert into support_tickets(order_id, created_by, role, category, priority, subject, refund_requested_cents, refund_status, lat, lng, sla_due_at, is_test)
  values (p_order, me.id, r, p_category, pr, subj, p_refund_cents, case when p_refund_cents is not null then 'requested' end,
          p_lat, p_lng, now() + fp_ticket_sla(pr), coalesce(me.is_test, false) or coalesce(o.is_test, false))
  returning id into tid;
  insert into support_messages(ticket_id, author_id, author_role, body, photo_path) values (tid, me.id, r, p_body, p_photo_path);
  if pr = 'urgent' then
    insert into ops_alerts(kind, order_id, message) values ('sos', p_order, format('%s from %s (ticket #%s)%s', subj, coalesce(me.full_name, 'rider'), tid,
      case when p_lat is not null then format(' at %s,%s', round(p_lat::numeric, 5), round(p_lng::numeric, 5)) else '' end));
  end if;
  return tid;
end $$;

create or replace function public.support_reply(p_ticket bigint, p_body text, p_photo_path text default null, p_internal boolean default false)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare t support_tickets; me profiles; adm boolean; mid bigint;
begin
  select * into me from profiles where id = auth.uid();
  select * into t from support_tickets where id = p_ticket;
  adm := me.role = 'admin';
  if t.id is null or not (adm or t.created_by = me.id) then raise exception 'ticket not found'; end if;
  perform fp_rate_limit('support_reply', 30, interval '10 minutes');
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 1 or char_length(p_body) > 2000 then raise exception 'Bericht moet 1–2000 tekens zijn'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then raise exception 'invalid photo'; end if;
  insert into support_messages(ticket_id, author_id, author_role, body, photo_path, internal)
  values (t.id, me.id, case when adm then 'admin' else t.role end, p_body, p_photo_path, adm and coalesce(p_internal, false))
  returning id into mid;
  update support_tickets set last_message_at = now(),
    status = case when adm and not coalesce(p_internal, false) then 'waiting_user' when not adm then 'open' else status end,
    first_response_at = case when adm and not coalesce(p_internal, false) then coalesce(first_response_at, now()) else first_response_at end,
    resolved_at = case when not adm then null else resolved_at end
  where id = t.id;
  return mid;
end $$;

create or replace function public.support_admin_update(p_ticket bigint, p_status text default null, p_priority text default null,
  p_assign uuid default null, p_unassign boolean default false) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(my_role()::text, '') <> 'admin' then raise exception 'admin only'; end if;
  update support_tickets set
    status = coalesce(p_status, status),
    resolved_at = case when p_status = 'resolved' then now() when p_status is not null then null else resolved_at end,
    priority = coalesce(p_priority, priority),
    sla_due_at = case when p_priority is not null and p_priority <> priority then created_at + fp_ticket_sla(p_priority) else sla_due_at end,
    assigned_to = case when p_unassign then null else coalesce(p_assign, assigned_to) end
  where id = p_ticket;
  if not found then raise exception 'ticket not found'; end if;
  if p_status = 'resolved' then
    insert into support_messages(ticket_id, author_role, body) values (p_ticket, 'system', 'Ticket opgelost. Reageer gerust als het nog niet in orde is.');
  end if;
end $$;

-- Restaurant: an ordered item is unavailable. Opens a ticket for admin (with the item value as refund suggestion)
-- and optionally marks the menu item sold out.
create or replace function public.support_item_unavailable(p_order bigint, p_order_item uuid, p_sold_out boolean default true, p_note text default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare oi order_items; o orders; tid bigint;
begin
  select * into o from orders where id = p_order and restaurant_id = my_restaurant();
  if o.id is null then raise exception 'Deze bestelling hoort niet bij jouw restaurant'; end if;
  select * into oi from order_items where id = p_order_item and order_id = p_order;
  if oi.id is null then raise exception 'item not on this order'; end if;
  tid := support_create('item_unavailable', format('"%s" (x%s) is niet beschikbaar.%s', oi.name, oi.qty, coalesce(' ' || left(btrim(p_note), 500), '')),
                        p_order, case when o.paid_at is not null then greatest(oi.price_cents * oi.qty, 1) end);
  if p_sold_out and oi.menu_item_id is not null then update menu_items set available = false where id = oi.menu_item_id and restaurant_id = o.restaurant_id; end if;
  return tid;
end $$;

-- Support numbers for the admin reports.
create or replace function public.report_support(p_from timestamptz, p_to timestamptz, p_include_test boolean default false) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare res jsonb;
begin
  if coalesce(my_role()::text, '') <> 'admin' then raise exception 'admin only'; end if;
  with t as (select * from support_tickets where created_at >= p_from and created_at < p_to and (p_include_test or not is_test))
  select jsonb_build_object(
    'tickets', (select count(*) from t),
    'open', (select count(*) from t where status <> 'resolved'),
    'by_category', coalesce((select jsonb_object_agg(category, n) from (select category, count(*) n from t group by 1) x), '{}'),
    'by_role', coalesce((select jsonb_object_agg(role, n) from (select role, count(*) n from t group by 1) x), '{}'),
    'median_first_response_min', (select round((percentile_cont(0.5) within group (order by extract(epoch from first_response_at - created_at) / 60))::numeric, 1) from t where first_response_at is not null),
    'avg_resolution_min', (select round(avg(extract(epoch from resolved_at - created_at) / 60)::numeric, 1) from t where resolved_at is not null),
    'sla_breached_pct', (select round(100.0 * count(*) filter (where coalesce(first_response_at, now()) > sla_due_at) / nullif(count(*), 0), 1) from t),
    'refund_requested_cents', (select coalesce(sum(refund_requested_cents), 0) from t),
    'refunded_cents', (select coalesce(sum(refund_cents), 0) from t where refund_status in ('refunded', 'pending', 'queued', 'simulated')),
    'sos', (select count(*) from t where category in ('sos', 'accident'))) into res;
  return res;
end $$;

-- Push/realtime hook: every new non-internal message (and SOS) goes through order-push.
create or replace function public.notify_support_push() returns trigger
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if not new.internal then
    perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('support_message_id', new.id), headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists support_messages_push on public.support_messages;
create trigger support_messages_push after insert on public.support_messages for each row execute function public.notify_support_push();

revoke all on function public.support_create(text, text, bigint, int, text, double precision, double precision) from public, anon;
revoke all on function public.support_reply(bigint, text, text, boolean) from public, anon;
revoke all on function public.support_admin_update(bigint, text, text, uuid, boolean) from public, anon;
revoke all on function public.support_item_unavailable(bigint, uuid, boolean, text) from public, anon;
revoke all on function public.report_support(timestamptz, timestamptz, boolean) from public, anon;
revoke all on function public.notify_support_push() from public, anon, authenticated;
revoke all on function public.fp_ticket_sla(text) from public, anon;
grant execute on function public.support_create(text, text, bigint, int, text, double precision, double precision) to authenticated;
grant execute on function public.support_reply(bigint, text, text, boolean) to authenticated;
grant execute on function public.support_admin_update(bigint, text, text, uuid, boolean) to authenticated;
grant execute on function public.support_item_unavailable(bigint, uuid, boolean, text) to authenticated;
grant execute on function public.report_support(timestamptz, timestamptz, boolean) to authenticated;
