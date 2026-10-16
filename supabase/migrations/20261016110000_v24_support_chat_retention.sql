-- v24 (approved by Zsolt): support tickets + their messages are kept 2 years after closing (resolved_at);
-- order chat messages 6 months after the order is completed (delivered, or cancelled/payment failed; created_at is used when there is no delivery time).
-- Run nightly by the purge-retention edge function: it first removes the support photos in storage, then calls the purge.
create or replace function public.fp_expired_support_photos(p_limit int default 500) returns table(path text)
language sql stable security definer set search_path = public as $$
  select m.photo_path from support_messages m join support_tickets t on t.id = m.ticket_id
  where m.photo_path is not null and t.status = 'resolved' and t.resolved_at < now() - interval '2 years'
  limit greatest(1, least(p_limit, 1000))
$$;
create or replace function public.fp_purge_support_chat() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_t int; n_c int;
begin
  delete from support_tickets where status = 'resolved' and resolved_at < now() - interval '2 years'; -- messages cascade
  get diagnostics n_t = row_count;
  delete from order_messages m using orders o where o.id = m.order_id
    and o.status in ('delivered', 'cancelled', 'payment_failed')
    and coalesce(o.delivered_at, o.created_at) < now() - interval '6 months';
  get diagnostics n_c = row_count;
  return jsonb_build_object('tickets', n_t, 'chat_messages', n_c);
end $$;
revoke execute on function public.fp_expired_support_photos(int), public.fp_purge_support_chat() from public, anon, authenticated;
grant execute on function public.fp_expired_support_photos(int), public.fp_purge_support_chat() to service_role;
