-- v40b: send x-fp-internal-secret from Vault on every legitimate internal caller
-- of order-refund, order-push, order-sms, and purge-retention.
--
-- The secret value itself is NOT in this file. It is created out-of-band with
-- vault.create_secret(..., 'fp_internal_secret', ...) and also stored as the
-- Edge Function secret FP_INTERNAL_SECRET. This function reads it via
-- vault.decrypted_secrets when building HTTP headers, so cron.job.command never
-- contains the secret.
--
-- Until a vault row named fp_internal_secret exists, headers are Content-Type
-- only (same as before). Safe to apply before or after the vault row is created.
-- Apply this before setting the Edge Function secret, so callers already send
-- the header when the functions start requiring it.
--
-- Admin JWT paths (support ticket refunds, admin order-page retry refund) do not
-- use this helper; the edge function accepts a verified admin JWT instead.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres;

create or replace function private.fp_edge_headers()
returns jsonb
language sql
stable
security definer
set search_path = vault
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'Content-Type', 'application/json',
        'x-fp-internal-secret', decrypted_secret
      )
      from vault.decrypted_secrets
      where name = 'fp_internal_secret'
      limit 1
    ),
    '{"Content-Type": "application/json"}'::jsonb
  );
$$;

revoke all on function private.fp_edge_headers() from public, anon, authenticated;
grant execute on function private.fp_edge_headers() to postgres;

-- ---------------------------------------------------------------------------
-- Triggers: same logic as live, headers now come from Vault
-- ---------------------------------------------------------------------------
create or replace function public.notify_order_refund()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.paid_at is not null and new.refund_status is null then
    -- Body is only a hint; the function re-reads the order and claims the refund atomically.
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-refund',
      body := jsonb_build_object('order_id', new.id),
      headers := private.fp_edge_headers(), timeout_milliseconds := 10000);
  end if;
  return new;
end
$function$;

create or replace function public.notify_order_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if (tg_op = 'INSERT' and new.status = 'placed')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.renotified_at is distinct from old.renotified_at)
         and new.status in ('placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled')) then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := private.fp_edge_headers(), timeout_milliseconds := 10000);
  end if;
  return new;
end
$function$;

create or replace function public.notify_order_sms()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if new.status is distinct from old.status and new.status in ('assigned', 'picked_up', 'delivered', 'ready') then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-sms',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := private.fp_edge_headers(), timeout_milliseconds := 10000
    );
  end if;
  return new;
end
$function$;

create or replace function public.notify_chat_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
    body := jsonb_build_object('chat_message_id', new.id), headers := private.fp_edge_headers(), timeout_milliseconds := 10000);
  return new;
end
$function$;

create or replace function public.notify_support_push()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  if not new.internal then
    perform net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('support_message_id', new.id), headers := private.fp_edge_headers(), timeout_milliseconds := 10000);
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- Cron fp-purge-proofs (job 8): wrap the HTTP call so the command text has no secret
-- ---------------------------------------------------------------------------
create or replace function public.fp_invoke_purge_retention()
returns bigint
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  rid bigint;
begin
  select net.http_post(
    url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/purge-retention',
    headers := private.fp_edge_headers(),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into rid;
  return rid;
end
$function$;

revoke all on function public.fp_invoke_purge_retention() from public, anon, authenticated;
grant execute on function public.fp_invoke_purge_retention() to postgres;

select cron.alter_job(
  job_id := 8,
  command := 'select public.fp_invoke_purge_retention()'
);
