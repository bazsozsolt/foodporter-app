-- Food Porter: payment statuses (must be its own migration: new enum values can't be used in the same transaction)
alter type order_status add value if not exists 'awaiting_payment' before 'placed';
alter type order_status add value if not exists 'payment_failed' after 'awaiting_payment';
