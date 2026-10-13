-- rls_auto_enable() is a platform helper used by the `ensure_rls` event trigger
-- (auto-enables RLS on new public tables). Event triggers don't need API callers to have EXECUTE.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
