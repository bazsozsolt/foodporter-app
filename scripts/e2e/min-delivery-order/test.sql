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
begin
  perform assert_true(fp_delivery_min_violation('pickup', 400) is null, 'pickup below the minimum is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 1500) is null, 'delivery at €15 is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 2000) is null, 'delivery above €15 is allowed');
  v := fp_delivery_min_violation('delivery', 1100);
  perform assert_true(v->>'min_cents' = '1500' and v->>'shortfall_cents' = '400', 'delivery below €15 returns the shortfall');
  v := fp_delivery_min_violation(null, 0);
  perform assert_true(v->>'min_cents' = '1500', 'null fulfilment is treated as delivery');

  v := fp_delivery_min_violation('delivery', 2000, 600, 0);
  perform assert_true(v->>'shortfall_cents' = '100' and v->>'food_cents' = '1400', 'a promo pushing delivery below €15 is blocked');
  perform assert_true(fp_delivery_min_violation('pickup', 2000, 600, 0) is null, 'the same promo on pickup is allowed');
  v := fp_delivery_min_violation('delivery', 2000, 0, 600);
  perform assert_true(v->>'shortfall_cents' = '100' and v->>'food_cents' = '1400', 'credit pushing delivery below €15 is blocked');
  perform assert_true(fp_delivery_min_violation('pickup', 2000, 0, 600) is null, 'the same credit on pickup is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 2000, 500, 0) is null, 'delivery at €15 after a promo is allowed');
  perform assert_true(fp_delivery_min_violation('delivery', 2000, 400, 100) is null, 'delivery at €15 after promo plus credit is allowed');
  v := fp_delivery_min_violation('delivery', 2000, 400, 200);
  perform assert_true(v->>'food_cents' = '1400', 'promo plus credit together can push delivery below €15');
  v := fp_delivery_min_violation('delivery', 1500, 1500, 0);
  perform assert_true(v->>'food_cents' = '0' and v->>'shortfall_cents' = '1500', 'a 100% promo leaves a €15 shortfall on delivery');
  perform assert_true(fp_delivery_min_violation('pickup', 1500, 1500, 0) is null, 'a 100% promo on pickup is allowed');
  v := fp_delivery_min_violation('delivery', 1000, 5000, 0);
  perform assert_true(v->>'food_cents' = '0', 'food after discount cannot go negative');

  insert into public.orders(id, status, fulfilment, subtotal_cents) values (1, 'awaiting_payment', 'delivery', 1100);
  perform assert_true(exists (select 1 from public.orders where id = 1), 'unpaid delivery below the minimum can still be created');

  begin
    insert into public.orders(id, status, fulfilment, subtotal_cents) values (2, 'placed', 'delivery', 1100);
    raise exception 'expected placed delivery below the minimum to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(not exists (select 1 from public.orders where id = 2), 'placed delivery below €15 is refused');

  insert into public.orders(id, status, fulfilment, subtotal_cents) values (3, 'placed', 'pickup', 1100);
  perform assert_true(exists (select 1 from public.orders where id = 3), 'placed pickup below €15 is allowed');

  begin
    update public.orders set status = 'placed' where id = 1;
    raise exception 'expected paying a short delivery to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
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
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select subtotal_cents from public.orders where id = 1) = 1500, 'cannot lower a placed delivery below the minimum');

  begin
    update public.orders set discount_cents = 200 where id = 1;
    raise exception 'expected a promo on a placed €15 delivery to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select discount_cents from public.orders where id = 1) = 0, 'cannot apply a promo that pushes a placed delivery below €15');

  begin
    insert into public.orders(id, status, fulfilment, subtotal_cents, discount_cents) values (5, 'placed', 'delivery', 2000, 600);
    raise exception 'expected placed delivery with a below-min promo to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(not exists (select 1 from public.orders where id = 5), 'placed delivery pushed below €15 by a promo is refused');

  begin
    insert into public.orders(id, status, fulfilment, subtotal_cents, credit_cents) values (6, 'placed', 'delivery', 2000, 600);
    raise exception 'expected placed delivery with below-min credit to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true(not exists (select 1 from public.orders where id = 6), 'placed delivery pushed below €15 by credit is refused');

  insert into public.orders(id, status, fulfilment, subtotal_cents, discount_cents) values (7, 'placed', 'pickup', 2000, 600);
  insert into public.orders(id, status, fulfilment, subtotal_cents, credit_cents) values (8, 'placed', 'pickup', 2000, 600);
  insert into public.orders(id, status, fulfilment, subtotal_cents, discount_cents) values (9, 'placed', 'delivery', 2000, 500);
  insert into public.orders(id, status, fulfilment, subtotal_cents, discount_cents) values (10, 'awaiting_payment', 'delivery', 2000, 2000);
  perform assert_true(exists (select 1 from public.orders where id in (7, 8)), 'placed pickup pushed below €15 by a promo or credit is allowed');
  perform assert_true(exists (select 1 from public.orders where id = 9), 'placed delivery at exactly €15 after a promo is allowed');
  perform assert_true(exists (select 1 from public.orders where id = 10), 'unpaid delivery with a 100% promo can still be created');

  begin
    update public.orders set status = 'placed' where id = 10;
    raise exception 'expected paying a full-promo delivery to fail';
  exception when others then
    if position('after discount and credit' in sqlerrm) = 0 then raise; end if;
  end;
  perform assert_true((select status from public.orders where id = 10) = 'awaiting_payment', 'a 100% promo cannot place a delivery order');

  update public.settings set min_delivery_order_cents = 0;
  insert into public.orders(id, status, fulfilment, subtotal_cents) values (4, 'placed', 'delivery', 100);
  perform assert_true(exists (select 1 from public.orders where id = 4), 'admin can set the platform minimum to zero');
end $$;
