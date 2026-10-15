-- v21: enforce the 30-day retention of delivery-proof photos promised in the privacy statement (was not enforced).
create or replace function public.fp_expired_proofs(p_limit int default 500) returns table(order_id bigint, path text)
language sql stable security definer set search_path = public, storage as $$
  select o.id, ob.name from storage.objects ob left join public.orders o on o.delivery_photo_path = ob.name
  where ob.bucket_id = 'delivery-proof' and coalesce(o.delivery_photo_at, o.delivered_at, ob.created_at) < now() - interval '30 days'
  order by ob.created_at limit greatest(1, least(p_limit, 1000))
$$;
revoke execute on function public.fp_expired_proofs(int) from public, anon, authenticated;
grant execute on function public.fp_expired_proofs(int) to service_role;
select cron.schedule('fp-purge-proofs', '25 3 * * *', $$select net.http_post(url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/purge-retention', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 20000)$$);
