-- v13 advisor: cover the new FKs
create index if not exists call_audit_caller_idx on call_audit(caller_id);
create index if not exists order_messages_author_idx on order_messages(author_id);
