-- v15: raise pg_net timeout for DB -> Edge Function calls (order-sms, order-refund, order-push) from the 5 s default to 10 s.
-- Mollie and address lookups are called from Edge Functions / the app, not from the database; no cron job uses pg_net.

CREATE OR REPLACE FUNCTION public.notify_chat_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
    body := jsonb_build_object('chat_message_id', new.id), headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_order_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if (tg_op = 'INSERT' and new.status = 'placed')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.renotified_at is distinct from old.renotified_at)
         and new.status in ('placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled')) then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_order_refund()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.paid_at is not null and new.refund_status is null then
    -- Body is only a hint; the function re-reads the order and claims the refund atomically.
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-refund',
      body := jsonb_build_object('order_id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_order_sms()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if new.status is distinct from old.status and new.status in ('assigned', 'picked_up', 'delivered') then
    -- Payload is only a hint; the function re-reads the order and dedupes, so spoofed calls can't send extra SMS.
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-sms',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000
    );
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_support_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if not new.internal then
    perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('support_message_id', new.id), headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 10000);
  end if;
  return new;
end $function$
;
