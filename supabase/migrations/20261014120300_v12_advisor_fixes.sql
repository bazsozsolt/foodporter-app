-- Advisor follow-ups: fixed search_path, FK indexes, primary key on rate_limits.
alter function public.fp_ticket_sla(text) set search_path to 'public';
create index if not exists support_tickets_assigned on public.support_tickets(assigned_to);
create index if not exists support_messages_author on public.support_messages(author_id);
alter table public.rate_limits add column if not exists id bigserial primary key;
