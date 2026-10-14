CREATE OR REPLACE FUNCTION public.support_create(p_category text, p_body text, p_order bigint DEFAULT NULL::bigint, p_refund_cents integer DEFAULT NULL::integer, p_photo_path text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me profiles; o orders; r text; pr text; subj text; tid bigint; total int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null then raise exception 'Je bent niet ingelogd'; end if;
  r := case when me.role in ('customer', 'restaurant', 'rider') then me.role::text end;
  if me.role = 'admin' then
    -- v13: admins use every app; pick the role from the order relation, then from the category (was: always 'customer')
    if p_order is not null then
      select case when x.customer_id = me.id and p_category in ('late','missing_item','wrong_item','damaged','rider_issue','payment','refund','other') then 'customer'
                  when x.rider_id = me.id and p_category in ('address_not_found','customer_unreachable','restaurant_delay','accident','safety','sos','payout','other') then 'rider' end
        into r from orders x where x.id = p_order;
    end if;
    r := coalesce(r, case when p_category in ('late','missing_item','wrong_item','damaged','rider_issue','payment','refund','other') then 'customer'
                          when p_category in ('address_not_found','customer_unreachable','restaurant_delay','accident','safety','sos','payout') then 'rider'
                          when p_category in ('rider_problem','order_problem','help','item_unavailable') then 'restaurant' end);
    if r is null then raise exception 'Onbekende categorie voor jouw rol'; end if;
  end if;
  if r is null then raise exception 'Je account kan geen melding maken'; end if;
  if (r = 'customer' and p_category not in ('late','missing_item','wrong_item','damaged','rider_issue','payment','refund','other'))
     or (r = 'restaurant' and p_category not in ('rider_problem','order_problem','help','item_unavailable','other'))
     or (r = 'rider' and p_category not in ('address_not_found','customer_unreachable','restaurant_delay','accident','safety','sos','payout','other')) then
    raise exception 'Onbekende categorie voor jouw rol';
  end if;
  perform fp_rate_limit(case when p_category = 'sos' then 'support_sos' else 'support_create' end, case when p_category = 'sos' then 5 else 6 end, interval '1 hour');
  p_body := btrim(coalesce(p_body, ''));
  if char_length(p_body) < 3 then raise exception 'Beschrijf het probleem in een paar woorden'; end if;
  if char_length(p_body) > 2000 then raise exception 'Bericht is te lang (max 2000 tekens)'; end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> auth.uid()::text then raise exception 'Foto kon niet worden gekoppeld, probeer opnieuw'; end if;
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
end $function$
;
