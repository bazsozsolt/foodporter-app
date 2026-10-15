-- pickup orders carry no delivery fee; delivery orders keep the 2.50–3.50 range
alter table orders drop constraint if exists orders_delivery_fee_cents_check;
alter table orders add constraint orders_delivery_fee_cents_check check ((fulfilment = 'pickup' and delivery_fee_cents = 0) or (delivery_fee_cents between 250 and 350));
