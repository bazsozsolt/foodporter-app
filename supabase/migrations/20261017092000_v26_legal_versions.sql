-- v26: new template versions for the approved financial plan.
-- rider_employment 0.4 (min-max default, 0-hours banned from 2028, bonus = distance fee), restaurant_partner 0.2 (commission 25/20/10),
-- customer_terms 0.2 (distance fees, service fee, 5 km zone), platform_transparency 0.4 (bonus = distance fee).
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('rider_employment','0.4','Arbeidsovereenkomst bezorger (direct dienstverband)','rider',date '2026-10-16','legal/rider_employment-v0.4.pdf','legal/rider_employment.html','f09981a5eb1cee52fe0b1e63c0693200a9e174ad6eccf43307b650856e4467f9',true),
('restaurant_partner','0.2','Partnerovereenkomst restaurant','restaurant',date '2026-10-16','legal/restaurant_partner-v0.2.pdf','legal/restaurant_partner.html','0841b07221a68152262ed5bb47b3c269290817394274145ddd3e22f1b4364528',true),
('customer_terms','0.2','Algemene voorwaarden klanten','customer',date '2026-10-16','legal/customer_terms-v0.2.pdf','legal/customer_terms.html','b8d699f7c32fb02e1704ab0137bf968ff1b631444298471bf4eb371701ea8444',false),
('platform_transparency','0.4','Transparantieverklaring algoritmisch management (richtlijn 2024/2831)','rider',date '2026-10-16','legal/platform_transparency-v0.4.pdf','legal/platform_transparency.html','138dabfa9a1a5091c4ce931c4e8321747eb9355d4af7304ce89bbfb18643d69d',true)
on conflict (id, version) do update set sha256 = excluded.sha256, title = excluded.title, pdf_path = excluded.pdf_path, html_path = excluded.html_path, requires_acceptance = excluded.requires_acceptance;
-- re-sign for TEST accounts only (test_seed); real accounts are asked to accept the new version in the app.
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'rider' and p.is_test and ((t.id = 'rider_employment' and t.version = '0.4') or (t.id = 'platform_transparency' and t.version = '0.4'))
  and not exists (select 1 from public.legal_acceptances a where a.profile_id = p.id and a.template_id = t.id and a.version = t.version);
insert into public.legal_acceptances(template_id, version, profile_id, restaurant_id, lang, text_sha256, method)
select t.id, t.version, p.id, p.restaurant_id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'restaurant' and p.is_test and p.restaurant_id is not null and t.id = 'restaurant_partner' and t.version = '0.2'
  and not exists (select 1 from public.legal_acceptances a where a.profile_id = p.id and a.template_id = t.id and a.version = t.version);
