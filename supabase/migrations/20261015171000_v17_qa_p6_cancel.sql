-- QA fix: cancelling a paid order gives back used credit and the promo use; the referrer's €5 is only
-- granted once the friend's first order is delivered (not on payment, which could be cancelled).
create or replace function public.fp_on_paid_p6() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref_owner uuid;
begin
  if new.status = 'placed' and old.status in ('awaiting_payment', 'payment_failed') then
    if new.promo_code is not null then update promo_codes set uses = uses + 1 where code = new.promo_code; end if;
    if new.credit_cents > 0 then
      insert into customer_credit (customer_id, cents, reason, order_id) values (new.customer_id, -new.credit_cents, 'used', new.id) on conflict do nothing;
    end if;
  elsif new.status = 'delivered' and old.status <> 'delivered' and new.referral_code is not null then
    select customer_id into ref_owner from referral_codes where code = new.referral_code;
    if ref_owner is not null and ref_owner <> new.customer_id then
      insert into customer_credit (customer_id, cents, reason, order_id) values (ref_owner, 500, 'referral_friend', new.id) on conflict do nothing;
    end if;
  elsif new.status = 'cancelled' and old.status not in ('cancelled', 'awaiting_payment', 'payment_failed') and new.paid_at is not null then
    if new.promo_code is not null then update promo_codes set uses = greatest(uses - 1, 0) where code = new.promo_code; end if;
    if new.credit_cents > 0 then
      insert into customer_credit (customer_id, cents, reason, order_id) values (new.customer_id, new.credit_cents, 'refund', new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.fp_on_paid_p6() from public, anon, authenticated;
