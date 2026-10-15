-- QA fix: a refund request is capped at what was actually paid (service fee + tip included, discount/credit excluded).
do $$
declare d text := pg_get_functiondef('public.support_create(text,text,bigint,integer,text,double precision,double precision)'::regprocedure);
begin
  if position('coalesce(o.subtotal_cents, 0) + coalesce(o.delivery_fee_cents, 0) - coalesce(o.refund_cents, 0)' in d) = 0 then raise exception 'support_create changed, patch not applied'; end if;
  d := replace(d, 'coalesce(o.subtotal_cents, 0) + coalesce(o.delivery_fee_cents, 0) - coalesce(o.refund_cents, 0)',
    'coalesce(o.subtotal_cents, 0) + coalesce(o.delivery_fee_cents, 0) + coalesce(o.service_fee_cents, 0) + coalesce(o.tip_cents, 0) - coalesce(o.discount_cents, 0) - coalesce(o.credit_cents, 0) - coalesce(o.refund_cents, 0)');
  execute d;
end $$;
