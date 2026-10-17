-- v27: rider bonus split. rider_employment 0.5 + platform_transparency 0.5 (fixed per-delivery bonus), customer_terms 0.3 (fees go to Food Porter).
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('rider_employment','0.5','Arbeidsovereenkomst bezorger (direct dienstverband)','rider',date '2026-10-17','legal/rider_employment-v0.5.pdf','legal/rider_employment.html','4c1e0140f6697007790b565ab524a05d90bde0ece663e27ff22c7634e7620ee1',true),
('customer_terms','0.3','Algemene voorwaarden klanten','customer',date '2026-10-17','legal/customer_terms-v0.3.pdf','legal/customer_terms.html','436a4a5abfabd794eb675273cbc03089e079e32fc82d7a77566d02c26c36d885',false),
('platform_transparency','0.5','Transparantieverklaring algoritmisch management (richtlijn 2024/2831)','rider',date '2026-10-17','legal/platform_transparency-v0.5.pdf','legal/platform_transparency.html','66b984cc769fdfc9078ea2f0f82671475fe5ffea5bf1fccc6bda4e5b7d52c461',true)
on conflict (id, version) do update set sha256 = excluded.sha256, title = excluded.title, pdf_path = excluded.pdf_path, html_path = excluded.html_path, requires_acceptance = excluded.requires_acceptance;
-- re-sign for TEST riders only (test_seed); real riders are asked to accept the new version in the app.
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'rider' and p.is_test and t.id in ('rider_employment', 'platform_transparency') and t.version = '0.5'
  and not exists (select 1 from public.legal_acceptances a where a.profile_id = p.id and a.template_id = t.id and a.version = t.version);
