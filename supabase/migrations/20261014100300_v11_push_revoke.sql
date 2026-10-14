-- Trigger-only function: no client role needs EXECUTE (advisor 0028/0029).
revoke all on function public.notify_order_push() from public, anon, authenticated;
