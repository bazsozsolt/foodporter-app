-- Assigned rider's name + ETA for the parties of an order, whether the rider won a bid or was assigned by hand.
create or replace function public.order_rider_info(p_order bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o record; me record; b record; nm text; eta int; est boolean := false;
begin
  select * into o from orders where id = p_order;
  if o.id is null or o.rider_id is null then return null; end if;
  select id, role, restaurant_id into me from profiles where id = auth.uid();
  if me.id is null then return null; end if;
  if not (me.role = 'admin' or o.customer_id = me.id or o.rider_id = me.id or (me.restaurant_id is not null and me.restaurant_id = o.restaurant_id)) then return null; end if;
  select rider_name, eta_minutes into b from bids where order_id = p_order and accepted and rider_id = o.rider_id order by created_at desc limit 1;
  nm := coalesce(b.rider_name, (select nullif(split_part(full_name, ' ', 1), '') from profiles where id = o.rider_id), 'rider');
  eta := b.eta_minutes;
  if eta is null then
    est := true;
    eta := greatest(0, ceil(extract(epoch from (coalesce(o.ready_at, now()) - coalesce(o.assigned_at, now()))) / 60))::int + 10;
  end if;
  return jsonb_build_object('rider_name', nm, 'eta_minutes', eta, 'estimated', est, 'since', coalesce(o.assigned_at, now()));
end $$;
revoke all on function public.order_rider_info(bigint) from public, anon;
grant execute on function public.order_rider_info(bigint) to authenticated;
