create or replace function public.notify_order_push() returns trigger
language plpgsql security definer set search_path to 'public', 'extensions' as $$
begin
  if (tg_op = 'INSERT' and new.status = 'placed')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or new.renotified_at is distinct from old.renotified_at)
         and new.status in ('placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled')) then
    perform net.http_post(
      url := 'https://joontqbhfqjqkyhlifle.supabase.co/functions/v1/order-push',
      body := jsonb_build_object('order_id', new.id, 'status', new.status),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
end $$;
