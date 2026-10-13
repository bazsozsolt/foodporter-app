-- Food Porter: second migration (paste into SQL Editor after the init migration)

-- Rider display name on bids (customers can't read rider profiles)
alter table bids add column if not exists rider_name text;

-- Admins can do everything with bids (lets an admin drive the demo end to end)
create policy "admin bids" on bids for all using (my_role() = 'admin') with check (my_role() = 'admin');

-- Metric view must respect RLS of the caller
alter view order_metrics set (security_invoker = true);

-- Order ids start at 1040 (matches pre-built static tracking pages)
alter table orders alter column id restart with 1040;

-- When an order is delivered, credit the rider with the full delivery fee
create or replace function credit_rider_on_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.rider_id is not null then
    insert into earnings (rider_id, order_id, amount_cents) values (new.rider_id, new.id, new.delivery_fee_cents)
    on conflict (order_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists orders_credit_rider on orders;
create trigger orders_credit_rider after update of status on orders for each row execute function credit_rider_on_delivery();

-- Bid acceptance: only the bidding rider or an admin, and only while the order is open
create or replace function accept_bid(p_bid uuid) returns void language plpgsql security definer set search_path = public as $$
declare b bids;
begin
  select * into b from bids where id = p_bid for update;
  if not found then raise exception 'bid not found'; end if;
  if not (b.rider_id = auth.uid() or my_role() = 'admin') then raise exception 'not allowed'; end if;
  if not exists (select 1 from orders where id = b.order_id and status = 'accepted' and rider_id is null) then
    raise exception 'order not open for bids';
  end if;
  update bids set accepted = true where id = p_bid;
  update orders set rider_id = b.rider_id, status = 'assigned', assigned_at = now() where id = b.order_id;
end $$;
