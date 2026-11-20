-- Ops plan for stale test order #2007 (Test Host → Test Rider Rik, assigned
-- 2026-10-18 11:59 CET, still assigned). NOT to be run without Zsolt's approval.
-- Do not run against 1043 or 1046. Do not print full payment ids.

-- 1) READ-ONLY inspection (safe). Look at the Mollie prefix only (tr_sim_ vs tr_).
select
  id, status, is_test, payment_status, refund_status, refund_cents,
  (paid_at is not null) as is_paid,
  (mollie_payment_id is not null) as has_mollie,
  left(coalesce(mollie_payment_id, ''), 7) as mollie_prefix,
  (rider_id is not null) as has_rider,
  assigned_at, ready_at, picked_up_at, cancel_reason,
  fp_assignment_stale(status, assigned_at, ready_at) as stale_after_v39
from public.orders
where id = 2007;

-- Would cancelling #2007 trigger a refund attempt?
-- YES, if paid_at is set, mollie_payment_id is set, and refund_status is null.
-- The cancel trigger (notify / pg_net) calls order-refund, which:
--   * for tr_sim_* test payments: records refund_status='simulated' and does not call Mollie;
--   * for a real Mollie id (including a TEST-mode tr_… payment): calls the Mollie Refunds API.
-- So a cancel of a paid test order with a real test payment id WILL attempt a Mollie test refund.

-- 2) Preferred after v39 is applied: do nothing to the row.
--    fp_assignment_stale excludes #2007 from stacking, the rider route and ETA.
--    Admins can list it with: select * from fp_list_stale_assignments();
--    The rider sees it in a "stuck assignment" list, not on the combined route.

-- 3) Do NOT try to unassign by setting status back to 'accepted'.
--    enforce_order_transition does not allow assigned → accepted, even for an admin.

-- 4) If ops must close the test order WITHOUT a Mollie refund attempt:
--    First set a non-null refund_status so the trigger's "refund_status is null"
--    condition fails, then cancel. ONLY for an is_test row, and only after the
--    inspection in (1). Never use this pattern on a real customer order.
--
-- begin;
--   update public.orders
--      set refund_status = 'none'
--    where id = 2007 and is_test is true and refund_status is null;
--   update public.orders
--      set status = 'cancelled', cancel_reason = 'admin_cancelled'
--    where id = 2007 and is_test is true and status in ('assigned', 'ready');
-- commit;
--
-- order-refund may still be invoked but will skip (nothing to refund / already claimed).

-- 5) If a simulated (tr_sim_*) payment is confirmed in (1), a normal admin
--    "Cancel & refund" is safe: the function records simulated and does not
--    call Mollie. Confirm the prefix first.
