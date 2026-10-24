-- v32: legal party = Sonic Jobs V.O.F. h.o.d.n. Food Porter in all 13 templates (version +0.1 each). KvK/VAT/address stay placeholders.
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance)
select n.id, n.version, c.title, c.audience, date '2026-10-24', 'legal/'||n.id||'-v'||n.version||'.pdf', 'legal/'||n.id||'.html', n.sha, c.requires_acceptance
from (values ('rider_zzp','0.3','b65b953fc2edc005d06877a0f0060cc0544c13dd046e9de6e6932e2032410caf'), ('rider_employment','0.6','66fc5b9f90eac0028f92e18932bb42de3a171dcb1f18def361f2c92e226da62b'), ('restaurant_partner','0.3','3b8e615e2703ce5c23b3d5f34acb72e56ccf22636476a76af9179eb5fb3a3bc4'), ('customer_terms','0.4','8b8a9833d37cb0a61fc6c7dca20ae63c62f656322448031ab098aeb60d39e29a'), ('privacy_statement','0.5','e35d16d941038ad626de214ade035f5441f041f6e7729d508de5360c1875001f'), ('dpa_restaurant','0.3','a0c820f41f11d4e98ca0d0d0f528eaed0920f22a0fd276c03cd02be000c1225f'), ('rider_conduct','0.2','06a3549a94b7b0d16de566bf77dfeb8c7d873883d2810a6dfdf18a70b46be97f'), ('platform_transparency','0.6','698b5156a0290781f69b4118e17d28a04bfcf24c2e422e285ac2ce7d71b44a94'), ('dpia_gps','0.4','3f58b584d746ab0aa14f8f0c8ef5230a4b6d849d08cf12a302fa1f0502905300'), ('processing_register','0.5','057afa902abce2fc150e2ea9bc270a160925ba08db3f2de33adaeb36639b6c00'), ('rider_onboarding','0.4','5b61c71cc0a9ef5573b743230ae8ff39f40317545e997ece09ed90e3973f5c2c'), ('deactivation_appeal','0.2','8cf6b5b7f8d86acf0d561b16611c68c5ac31dc17abe7ac0d0339581e2463f675'), ('dpa_payroll','0.2','b550732d03279d494664619eee753c6c73541fc8f5ca28a4501ac8fc6a3e5fa7')) n(id, version, sha)
join lateral (select * from public.legal_templates t where t.id = n.id order by string_to_array(t.version,'.')::int[] desc limit 1) c on true
where c.version <> n.version
on conflict (id, version) do update set sha256 = excluded.sha256;
-- re-sign for TEST accounts only; real users are asked to accept the new version in the app.
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p join public.legal_templates t on t.effective_date = date '2026-10-24'
where p.role = 'rider' and p.is_test and t.id in ('rider_employment','rider_conduct','platform_transparency')
  and not exists (select 1 from public.legal_acceptances a where a.profile_id = p.id and a.template_id = t.id and a.version = t.version);
insert into public.legal_acceptances(template_id, version, profile_id, restaurant_id, lang, text_sha256, method)
select t.id, t.version, p.id, p.restaurant_id, 'nl', t.sha256, 'test_seed' from public.profiles p join public.legal_templates t on t.effective_date = date '2026-10-24'
where p.role = 'restaurant' and p.is_test and p.restaurant_id is not null and t.id in ('restaurant_partner','dpa_restaurant')
  and not exists (select 1 from public.legal_acceptances a where a.profile_id = p.id and a.template_id = t.id and a.version = t.version);
