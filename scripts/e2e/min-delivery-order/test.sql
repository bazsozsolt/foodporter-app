create or replace function public.assert_true(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if not coalesce(p_cond, false) then
    raise exception 'FAIL %', p_msg;
  end if;
  raise notice 'PASS %', p_msg;
end $$;

do $$
declare
  v jsonb;
  v_msg text;
begin
  perform assert_true(fp_delivery_min_violation('pickup', 400) is null, 'pickup below the minimum is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 1500) is null, 'delivery at €15 is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 2000) is null, 'delivery above €15 is allowed');
  v := fp_delivery_min_violation('delivery', 1100);
  perform assert_true(v->>'min_cents' = '1500' and v->>'shortfall_cents' = '400', 'delivery below €15 returns the shortfall');
  v := fp_delivery_min_violation(null, 0);
  perform assert_true(v->>'min_cents' = '1500', 'null fulfilment is treated as delivery');

  insert into public.orders(id, status, fulfilment, subtotal_cents) values (1, 'awaiting_payment', 'delivery', 1100);
  perform assert_true(exists (select 1 from public.orders where id = 1), 'unpaid delivery below the minimum can still be created');

  begin
    insert into public.orders(id, status, fulfilment, subtotal_cents) values (2, 'placed', 'delivery', 1100);
    raise exception 'expected placed delivery below the minimum to fail';
  exception when others then
    if position('food subtotal' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(not exists (select 1 from public.orders where id = 2), 'placed delivery below €15 is refused');

  insert into public.orders(id, status, fulfilment, subtotal_cents) values (3, 'placed', 'pickup', 1100);
  perform assert_true(exists (select 1 from public.orders where id = 3), 'placed pickup below €15 is allowed');

  begin
    update public.orders set status = 'placed' where id = 1;
    raise exception 'expected paying a short delivery to fail';
  exception when others then
    if position('food subtotal' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select status from public.orders where id = 1) = 'awaiting_payment', 'status stays unpaid when the minimum is not met');

  update public.orders set subtotal_cents = 1500 where id = 1;
  update public.orders set status = 'placed' where id = 1;
  perform assert_true((select status from public.orders where id = 1) = 'placed', 'delivery can be placed once the subtotal reaches €15');

  -- already-placed order at the minimum (stand-in for a live paid order): a no-op update is fine
  update public.orders set status = 'placed' where id = 1;
  perform assert_true((select subtotal_cents from public.orders where id = 1) = 1500, 're-saving a placed order at the minimum does not error');

  -- Simulate a paid order that already existed when the trigger was added (like 1043).
  update public.settings set min_delivery_order_cents = 0;
  insert into public.orders(id, status, fulfilment, subtotal_cents) values (1043, 'placed', 'delivery', 1350);
  update public.settings set min_delivery_order_cents = 1500;
  update public.orders set status = 'placed' where id = 1043;
  perform assert_true((select subtotal_cents from public.orders where id = 1043) = 1350, 'an already placed below-minimum order is not rewritten or blocked on a no-op update');

  begin
    update public.orders set subtotal_cents = 1000 where id = 1;
    raise exception 'expected lowering a placed delivery subtotal to fail';
  exception when others then
    if position('food subtotal' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select subtotal_cents from public.orders where id = 1) = 1500, 'cannot lower a placed delivery below the minimum');

  update public.settings set min_delivery_order_cents = 0;
  insert into public.orders(id, status, fulfilment, subtotal_cents) values (4, 'placed', 'delivery', 100);
  perform assert_true(exists (select 1 from public.orders where id = 4), 'admin can set the platform minimum to zero');
end $$;
