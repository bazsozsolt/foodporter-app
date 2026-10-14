-- Orders placed by test accounts were stored with is_test = false (the insert trigger forced false), so they showed up in
-- "real only" reports. Inherit the flag from the customer's profile instead and backfill existing test orders.
create or replace function public.sanitize_order_insert() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.status := 'awaiting_payment'; new.rider_id := null; new.paid_at := null; new.payment_status := null;
    new.mollie_payment_id := null; new.refund_id := null; new.refund_status := null; new.refund_cents := null; new.refunded_at := null;
    new.accepted_at := null; new.assigned_at := null; new.ready_at := null; new.picked_up_at := null; new.delivered_at := null;
    new.cancelled_at := null; new.cancel_reason := null; new.prep_minutes := null; new.commission_cents := null;
    new.restaurant_payout_id := null; new.bid_window_closes_at := null; new.renotified_at := null; new.bid_alerted_at := null;
    new.sms_sent := '{}'; new.created_at := now();
    new.is_test := coalesce((select is_test from profiles where id = new.customer_id), false);
    new.delivery_fee_cents := (select delivery_fee_cents from settings limit 1);
    if char_length(coalesce(new.address, '')) > 200 or char_length(coalesce(new.phone, '')) > 30 then
      raise exception 'address or phone too long';
    end if;
    if not exists (select 1 from restaurants where id = new.restaurant_id and active) then
      raise exception 'restaurant not available';
    end if;
  end if;
  return new;
end $function$;

update orders o set is_test = true from profiles p
 where p.id = o.customer_id and p.is_test and not o.is_test and o.id not in (1043, 1046);
