-- Ops: close out refund alerts automatically so the alert list only shows things a person must act on.
--  * Simulated TEST payments (mollie id tr_sim_*, order is_test): nothing was ever charged, so there is nothing to refund.
--    Mark refund_status 'simulated' and resolve their refund_failed alerts.
--  * Any refund that has since succeeded (refund_status 'refunded'): resolve its stale refund_failed alerts.
--  * Real failed refunds are NOT retried automatically (that could refund twice); they stay open for ops.
-- Every close-out is written to audit_events. Runs every minute via pg_cron.
create or replace function public.fp_close_out_refunds() returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare n_sim int := 0; n_done int := 0;
begin
  with s as (
    update orders set refund_status = 'simulated'
     where is_test and mollie_payment_id like 'tr\_sim\_%' and status = 'cancelled' and paid_at is not null
       and coalesce(refund_status, 'failed') = 'failed'
       and (refund_status = 'failed' or cancelled_at < now() - interval '2 minutes')
    returning id)
  insert into audit_events(order_id, type, from_value, to_value)
  select id, 'refund_closed_out', 'failed', 'simulated (test payment, nothing charged)' from s;
  get diagnostics n_sim = row_count;

  with r as (
    update ops_alerts a set resolved_at = now(),
           message = a.message || case when o.refund_status = 'simulated' then ' · auto-closed: test payment, nothing to refund'
                                       else ' · auto-closed: refund succeeded' end
      from orders o
     where o.id = a.order_id and a.kind = 'refund_failed' and a.resolved_at is null
       and o.refund_status in ('simulated', 'refunded')
    returning a.order_id)
  select count(*) into n_done from r;
  return jsonb_build_object('simulated', n_sim, 'alerts_resolved', n_done);
end $$;
revoke all on function public.fp_close_out_refunds() from public, anon, authenticated;

select cron.unschedule('fp-close-out-refunds') where exists (select 1 from cron.job where jobname = 'fp-close-out-refunds');
select cron.schedule('fp-close-out-refunds', '* * * * *', 'select public.fp_close_out_refunds()');

select public.fp_close_out_refunds();
