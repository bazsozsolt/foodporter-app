-- v10: fixes found by the pilot-evening simulation.
-- 1) Stuck auctions: when the only bidder was busy at resolve time (max orders / stacking rule), the window was reset to
--    NULL but the bid stayed. No new bid could reopen the window (the rider can't bid twice), so the order hung forever.
--    Now: keep retrying every 15 s while eligible-later bids exist, and also pick up orders whose window is NULL but have bids.
create or replace function fp_resolve_bids(p_order bigint default null) returns integer
language plpgsql security definer set search_path = public as $$
declare o record; w bids; n int := 0; busy int;
begin
  for o in select x.id from orders x where x.status = 'accepted' and x.rider_id is null
             and (x.bid_window_closes_at <= now()
                  or (x.bid_window_closes_at is null and exists (select 1 from bids b where b.order_id = x.id and not b.accepted)))
             and (p_order is null or x.id = p_order) order by x.bid_window_closes_at nulls first, x.id for update skip locked loop
    w := null;
    for w in select b.* from bids b where b.order_id = o.id and not b.accepted
               and b.rider_id in (select id from profiles where status = 'active')
               order by b.eta_minutes asc, b.created_at asc, b.id asc loop
      exit when fp_stack_reason(w.rider_id, o.id) is null;
      w := null;
    end loop;
    if w.id is not null then
      select count(*) into busy from orders where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up');
      update bids set accepted = true where id = w.id;
      update orders set rider_id = w.rider_id, status = 'assigned', assigned_at = now(), stacked = busy > 0 where id = o.id;
      if busy > 0 then update orders set stacked = true where rider_id = w.rider_id and status in ('assigned', 'ready', 'picked_up'); end if;
      n := n + 1;
    elsif exists (select 1 from bids b join profiles p on p.id = b.rider_id and p.status = 'active'
                  where b.order_id = o.id and not b.accepted and b.created_at > now() - interval '5 minutes') then
      update orders set bid_window_closes_at = now() + interval '15 seconds' where id = o.id; -- bidders busy right now: retry soon
    elsif exists (select 1 from bids b where b.order_id = o.id and not b.accepted) then
      -- bids older than 5 min are stale (their ETA promise no longer holds): drop them so riders can bid again
      delete from bids where order_id = o.id and not accepted;
      update orders set bid_window_closes_at = null where id = o.id;
    else
      update orders set bid_window_closes_at = null where id = o.id; -- nobody left: reopen for new bids
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.fp_resolve_bids(bigint) from public, anon, authenticated;

-- 2) Milestone times were only stamped for restaurant/rider accounts. When ops (admin) moved an order forward,
--    accepted_at/ready_at/picked_up_at/delivered_at stayed NULL, so the key metric silently dropped those orders.
create or replace function pin_order_fields() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and coalesce(my_role()::text, '') <> 'admin' then
    new.created_at := old.created_at; new.is_test := old.is_test; new.address := old.address; new.phone := old.phone;
    new.assigned_at := old.assigned_at;
    new.accepted_at := case when new.status = 'accepted' and old.status <> 'accepted' then now() else old.accepted_at end;
    new.picked_up_at := case when new.status = 'picked_up' and old.status <> 'picked_up' then now() else old.picked_up_at end;
    new.delivered_at := case when new.status = 'delivered' and old.status <> 'delivered' then now() else old.delivered_at end;
    if new.status = 'ready' and old.status <> 'ready' then new.ready_at := now(); end if;
  else
    -- admin / service: keep explicit values, but never leave a milestone empty
    if new.status = 'accepted' and old.status <> 'accepted' then new.accepted_at := coalesce(new.accepted_at, now()); end if;
    if new.status = 'picked_up' and old.status <> 'picked_up' then new.picked_up_at := coalesce(new.picked_up_at, now()); end if;
    if new.status = 'delivered' and old.status <> 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  end if;
  return new;
end $$;
revoke execute on function public.pin_order_fields() from public, anon, authenticated;

-- one-off repair for orders already affected (test data from the simulation): accepted_at from the audit trail
update orders o set accepted_at = e.created_at
from (select order_id, min(created_at) created_at from audit_events where type = 'status_change' and to_value = 'accepted' group by order_id) e
where e.order_id = o.id and o.accepted_at is null and o.status not in ('awaiting_payment', 'payment_failed', 'placed');
