-- Hot path in order_facts: per-order audit lookups by type, and ratings joined by order.
create index if not exists audit_events_order_type_idx on public.audit_events(order_id, type);
create index if not exists ratings_order_idx on public.ratings(order_id);
