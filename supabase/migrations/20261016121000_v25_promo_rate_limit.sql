-- v25 audit (MEDIUM): rate-limit unknown promo/referral codes (10 per hour per customer).
create or replace function public.fp_quote_discount(p_customer uuid, p_subtotal int, p_code text, p_use_credit boolean, p_order bigint default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare pc promo_codes; v_code text := upper(btrim(coalesce(p_code, ''))); disc int := 0; credit int := 0; bal int; prev int; kind text := null; ref_owner uuid; err text := null;
begin
  if auth.uid() is not null and auth.uid() <> p_customer then raise exception 'not allowed'; end if;
  select count(*) into prev from orders where customer_id = p_customer and paid_at is not null and (p_order is null or id <> p_order);
  -- v25 audit: max 10 unknown codes per customer per hour (brute force on promo/referral codes)
  if v_code <> '' and (select count(*) from rate_limits where profile_id = p_customer and action = 'promo_fail' and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('kind', null, 'code', null, 'discount_cents', 0, 'credit_cents', 0, 'error', 'Te veel onjuiste codes geprobeerd. Probeer het over een uur opnieuw.');
  end if;
  if v_code <> '' then
    select * into pc from promo_codes where promo_codes.code = v_code;
    if found then
      kind := 'promo';
      if not pc.active then err := 'Deze code is niet meer geldig.';
      elsif pc.expires_at is not null and pc.expires_at < now() then err := 'Deze code is verlopen.';
      elsif pc.max_uses is not null and pc.uses >= pc.max_uses then err := 'Deze code is op.';
      elsif pc.first_order_only and prev > 0 then err := 'Deze code geldt alleen voor je eerste bestelling.';
      elsif p_subtotal < pc.min_order_cents then err := format('Deze code geldt vanaf €%s aan gerechten.', to_char(pc.min_order_cents / 100.0, 'FM990.00'));
      elsif exists (select 1 from orders where customer_id = p_customer and promo_code = v_code and paid_at is not null and (p_order is null or id <> p_order)) then err := 'Je hebt deze code al gebruikt.';
      else disc := case when pc.kind = 'percent' then (p_subtotal * pc.value) / 100 else least(pc.value, p_subtotal) end;
      end if;
    else
      select customer_id into ref_owner from referral_codes where referral_codes.code = v_code;
      if ref_owner is null then err := 'Onbekende code.'; insert into rate_limits(profile_id, action, at) values (p_customer, 'promo_fail', now());
      else
        kind := 'referral';
        if ref_owner = p_customer then err := 'Je kunt je eigen code niet gebruiken.';
        elsif prev > 0 then err := 'Een uitnodigingscode geldt alleen voor je eerste bestelling.';
        else disc := least(500, p_subtotal); end if;
      end if;
    end if;
  end if;
  if p_use_credit then
    select coalesce(sum(cents), 0) into bal from customer_credit where customer_id = p_customer;
    credit := greatest(0, least(bal, p_subtotal - disc));
  end if;
  return jsonb_build_object('kind', kind, 'code', case when err is null and kind is not null then v_code end, 'discount_cents', case when err is null then disc else 0 end, 'credit_cents', credit, 'error', err);
end $$;
