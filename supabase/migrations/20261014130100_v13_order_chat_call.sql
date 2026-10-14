-- v13: per-order chat (customer<->rider, customer<->restaurant) and audited "call" RPC with a provider flag.
alter table settings add column if not exists chat_lock_minutes integer not null default 120 check (chat_lock_minutes between 0 and 10080),
  add column if not exists call_provider text not null default 'direct' check (call_provider in ('direct','masked','off')),
  add column if not exists call_masked_number text;
comment on column settings.call_provider is 'direct = tel: to the counterpart''s own number; masked = return call_masked_number (set by a future Twilio/Bird proxy integration); off = no call button';

create table if not exists order_messages (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  channel text not null check (channel in ('rider','restaurant')),
  author_id uuid references profiles(id) on delete set null,
  author_role text not null check (author_role in ('customer','rider','restaurant','admin')),
  body text not null check (char_length(body) between 1 and 500),
  quick boolean not null default false,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists order_messages_order_idx on order_messages(order_id, channel, created_at);
alter table order_messages enable row level security;
revoke all on order_messages from anon;
revoke insert, update, delete on order_messages from authenticated;
grant select on order_messages to authenticated;

create table if not exists call_audit (
  id bigserial primary key,
  order_id bigint not null references orders(id) on delete cascade,
  caller_id uuid references profiles(id) on delete set null,
  caller_role text not null,
  callee_role text not null,
  provider text not null,
  created_at timestamptz not null default now()
);
create index if not exists call_audit_order_idx on call_audit(order_id);
alter table call_audit enable row level security;
revoke all on call_audit from anon, authenticated;
grant select on call_audit to authenticated;
create policy "admin reads call audit" on call_audit for select to authenticated using ((select my_role()) = 'admin');

-- Which side of the conversation the caller is on (null = not a participant). Admins are never a "party" unless they are the actual customer/rider.
create or replace function fp_chat_side(p_order bigint, p_channel text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when o.customer_id = auth.uid() then 'customer'
    when p_channel = 'rider' and o.rider_id = auth.uid() then 'rider'
    when p_channel = 'restaurant' and o.restaurant_id is not null and o.restaurant_id = (select my_restaurant()) then 'restaurant'
  end from orders o where o.id = p_order;
$$;

-- Is the chat open (writable and readable by the parties)? Locks chat_lock_minutes after delivery, and on cancel.
create or replace function fp_chat_open(p_order bigint, p_channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when o.status = 'delivered' then o.delivered_at > now() - make_interval(mins => (select chat_lock_minutes from settings limit 1))
      when p_channel = 'rider' then o.rider_id is not null and o.status in ('assigned','ready','picked_up')
      else o.status in ('placed','accepted','assigned','ready','picked_up') end
    from orders o where o.id = p_order), false);
$$;
revoke execute on function fp_chat_side(bigint, text), fp_chat_open(bigint, text) from public, anon;
grant execute on function fp_chat_side(bigint, text), fp_chat_open(bigint, text) to authenticated;

create policy "chat parties and admins read" on order_messages for select to authenticated using (
  (select my_role()) = 'admin' or (fp_chat_side(order_id, channel) is not null and fp_chat_open(order_id, channel)));

create or replace function order_chat_send(p_order bigint, p_channel text, p_body text, p_quick boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare side text; o orders; mid bigint;
begin
  if auth.uid() is null then raise exception 'Je bent niet ingelogd'; end if;
  if p_channel not in ('rider','restaurant') then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  side := fp_chat_side(p_order, p_channel);
  if side is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  if not fp_chat_open(p_order, p_channel) then raise exception 'Chat is gesloten voor deze bestelling'; end if;
  p_body := btrim(coalesce(p_body, ''));
  if p_body = '' then raise exception 'Bericht is leeg'; end if;
  if char_length(p_body) > 500 then raise exception 'Bericht is te lang (max 500 tekens)'; end if;
  perform fp_rate_limit('order_chat', 40, interval '10 minutes');
  select * into o from orders where id = p_order;
  insert into order_messages(order_id, channel, author_id, author_role, body, quick, is_test)
    values (p_order, p_channel, auth.uid(), side, p_body, coalesce(p_quick, false), coalesce(o.is_test, false)) returning id into mid;
  return mid;
end $$;
revoke execute on function order_chat_send(bigint, text, text, boolean) from public, anon;
grant execute on function order_chat_send(bigint, text, text, boolean) to authenticated;

-- Call the other party. Only the customer and the assigned rider, only from assigned until delivered. Every call is audited.
create or replace function order_call(p_order bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; side text; num text; prov text; masked text;
begin
  if auth.uid() is null then raise exception 'Je bent niet ingelogd'; end if;
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  side := case when o.customer_id = auth.uid() then 'customer' when o.rider_id = auth.uid() then 'rider' end;
  if side is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  if o.rider_id is null or o.status not in ('assigned','ready','picked_up') then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  select call_provider, call_masked_number into prov, masked from settings limit 1;
  if prov = 'off' then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  perform fp_rate_limit('order_call', 10, interval '1 hour');
  if prov = 'masked' then num := masked;
  elsif side = 'customer' then select phone into num from profiles where id = o.rider_id;
  else num := o.phone; end if;
  num := nullif(regexp_replace(coalesce(num, ''), '[^0-9+]', '', 'g'), '');
  if num is null then raise exception 'Geen telefoonnummer beschikbaar'; end if;
  insert into call_audit(order_id, caller_id, caller_role, callee_role, provider)
    values (p_order, auth.uid(), side, case side when 'customer' then 'rider' else 'customer' end, prov);
  return jsonb_build_object('provider', prov, 'number', num);
end $$;
revoke execute on function order_call(bigint) from public, anon;
grant execute on function order_call(bigint) to authenticated;

create or replace function notify_chat_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
    body := jsonb_build_object('chat_message_id', new.id), headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
end $$;
revoke execute on function notify_chat_push() from public, anon, authenticated;
drop trigger if exists order_messages_push on order_messages;
create trigger order_messages_push after insert on order_messages for each row execute function notify_chat_push();

alter publication supabase_realtime add table order_messages;
