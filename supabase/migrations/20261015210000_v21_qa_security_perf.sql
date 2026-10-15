-- v21 QA: cover legal FKs with indexes; one SELECT policy on legal_templates (advisor: multiple permissive policies)
create index if not exists legal_acceptances_tpl_idx on public.legal_acceptances(template_id, version);
create index if not exists legal_requests_tpl_idx on public.legal_requests(template_id, version);
create index if not exists legal_requests_acc_idx on public.legal_requests(acceptance_id);
create index if not exists legal_requests_rest_idx on public.legal_requests(restaurant_id);
drop policy if exists legal_tpl_read on public.legal_templates;
drop policy if exists legal_tpl_admin_read on public.legal_templates;
create policy legal_tpl_read on public.legal_templates for select to anon, authenticated
  using (audience <> 'internal' or (select my_role())::text = 'admin');
