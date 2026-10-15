-- v17 QA: advisor fixes for the new objects.
alter function public.fp_guard_p6() set search_path = public;
alter function public.fp_menu_allergen_stamp() set search_path = public;
alter function public.fp_valid_allergens(text[]) set search_path = public;
alter function public.fp_guard_tip() set search_path = public;
alter function public.fp_valid_hours(jsonb) set search_path = public;
alter function public.fp_guard_pickup() set search_path = public;
alter function public.fp_guard_proof() set search_path = public;
alter function public.fp_pickup_insert() set search_path = public;
alter function public.fp_no_bids_on_pickup() set search_path = public;
-- trigger functions are never called over RPC
revoke execute on function public.fp_on_paid_p6() from public, anon, authenticated;
revoke execute on function public.fp_status_review() from public, anon, authenticated;
-- signed-in only
revoke execute on function public.fp_proof_access(text, boolean) from public, anon;
grant execute on function public.fp_proof_access(text, boolean) to authenticated;
revoke execute on function public.my_credit_cents() from public, anon;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_credit_cents(), public.my_referral_code() to authenticated;
-- indexes for new foreign keys
create index if not exists account_status_log_profile_idx on account_status_log (profile_id);
create index if not exists customer_credit_customer_idx on customer_credit (customer_id);
create index if not exists promo_codes_created_by_idx on promo_codes (created_by);
-- one select policy on account_status_log, evaluated once per query
drop policy if exists "admin reads status log" on account_status_log;
drop policy if exists "own status log" on account_status_log;
create policy "status log read" on account_status_log for select to authenticated
  using (profile_id = (select auth.uid()) or (select my_role()) = 'admin');
