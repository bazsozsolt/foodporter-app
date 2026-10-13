-- Food Porter: custom/extendable prep time + SMS notifications on status changes

-- 1) Prep time 5..120 minutes
alter table orders drop constraint if exists orders_prep_minutes_check;
alter table orders add constraint orders_prep_minutes_check check (prep_minutes is null or prep_minutes between 5 and 120);

-- Restaurants may change prep_minutes / ready_at only before the food is ready
create or replace function guard_order_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    if new.customer_id is distinct from old.customer_id
      or new.restaurant_id is distinct from old.restaurant_id
      or new.rider_id is distinct from old.rider_id
      or new.subtotal_cents is distinct from old.subtotal_cents
      or new.delivery_fee_cents is distinct from old.delivery_fee_cents
      or new.commission_cents is distinct from old.commission_cents
      or new.mollie_payment_id is distinct from old.mollie_payment_id
      or new.paid_at is distinct from old.paid_at
      or new.payment_status is distinct from old.payment_status
      or new.sms_sent is distinct from old.sms_sent
      or old.status in ('awaiting_payment', 'payment_failed') then
      raise exception 'not allowed to change these order fields';
    end if;
    if new.prep_minutes is distinct from old.prep_minutes
       and (old.status not in ('placed', 'accepted', 'assigned') or my_restaurant() is distinct from old.restaurant_id) then
      raise exception 'prep time can only be changed by the restaurant before the order is ready';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_order_update() from public, anon, authenticated;

-- 2) SMS: remember which notifications were sent (dedupe), call the order-sms Edge Function on status changes
alter table orders add column if not exists sms_sent text[] not null default '{}';
create extension if not exists pg_net with schema extensions;

create or replace function notify_order_sms() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status is distinct from old.status and new.status in ('assigned', 'picked_up', 'delivered') then
    -- Payload is only a hint; the function re-reads the order and dedupes, so spoofed calls can't send extra SMS.
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-sms',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
revoke execute on function public.notify_order_sms() from public, anon, authenticated;
drop trigger if exists orders_notify_sms on orders;
create trigger orders_notify_sms after update of status on orders for each row execute function notify_order_sms();
