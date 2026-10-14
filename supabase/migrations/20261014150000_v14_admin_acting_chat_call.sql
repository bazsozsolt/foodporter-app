-- v14: admins use every app (customer, rider, restaurant views). They could see chat + call on active orders they
-- are not a party of, but the server refused them ("Je hebt geen toegang tot deze chat"). Admins now take part as
-- 'admin' (messages are labelled Admin, pushes go to the order's parties) and can call either party (audited).
create or replace function fp_chat_side(p_order bigint, p_channel text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when o.customer_id = auth.uid() then 'customer'
    when p_channel = 'rider' and o.rider_id = auth.uid() then 'rider'
    when p_channel = 'restaurant' and o.restaurant_id is not null and o.restaurant_id = (select my_restaurant()) then 'restaurant'
    when (select my_role()) = 'admin' then 'admin'
  end from orders o where o.id = p_order;
$$;

drop function if exists order_call(bigint);
create or replace function order_call(p_order bigint, p_target text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; side text; target text; num text; prov text; masked text;
begin
  if auth.uid() is null then raise exception 'Je bent niet ingelogd'; end if;
  select * into o from orders where id = p_order;
  if o.id is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  side := case when o.customer_id = auth.uid() then 'customer' when o.rider_id = auth.uid() then 'rider' when (select my_role()) = 'admin' then 'admin' end;
  if side is null then raise exception 'Je hebt geen toegang tot deze chat'; end if;
  target := case side when 'customer' then 'rider' when 'rider' then 'customer' else p_target end;
  if target is null or target not in ('rider','customer') then raise exception 'Kies wie je wilt bellen'; end if;
  if o.rider_id is null or o.status not in ('assigned','ready','picked_up') then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  select call_provider, call_masked_number into prov, masked from settings limit 1;
  if prov = 'off' then raise exception 'Bellen kan alleen tijdens een actieve bezorging'; end if;
  perform fp_rate_limit('order_call', 10, interval '1 hour');
  if prov = 'masked' then num := masked;
  elsif target = 'rider' then select phone into num from profiles where id = o.rider_id;
  else num := o.phone; end if;
  num := nullif(regexp_replace(coalesce(num, ''), '[^0-9+]', '', 'g'), '');
  if num is null then raise exception 'Geen telefoonnummer beschikbaar'; end if;
  insert into call_audit(order_id, caller_id, caller_role, callee_role, provider) values (p_order, auth.uid(), side, target, prov);
  return jsonb_build_object('provider', prov, 'number', num);
end $$;
revoke execute on function order_call(bigint, text) from public, anon;
grant execute on function order_call(bigint, text) to authenticated;
