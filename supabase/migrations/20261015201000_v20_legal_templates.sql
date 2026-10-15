-- v20 legal recheck: new template versions (02 v0.3 CAO/contract kinds, 08 v0.3, 05/09/10/11 v0.3, 06 v0.2, new 13 payroll DPA) + test signatures
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('rider_employment','0.3','Arbeidsovereenkomst bezorger (direct dienstverband)','rider',date '2026-10-15','legal/rider_employment-v0.3.pdf','legal/rider_employment.html','a31b56d4c69d40ef98376384524fd2b6faccd122961f4183551afac9ef21c80b',true),
('privacy_statement','0.3','Privacyverklaring (update v18)','all',date '2026-10-15','legal/privacy_statement-v0.3.pdf','legal/privacy_statement.html','22c908beb081899717bef5c09850f25715c761cdc72f61f299487e0e85600ab9',false),
('dpa_restaurant','0.2','Verwerkersovereenkomst (DPA) restaurant + subverwerkers','restaurant',date '2026-10-15','legal/dpa_restaurant-v0.2.pdf','legal/dpa_restaurant.html','e8c14a1c2e7b185b1d63c57df8826e9c0a5dc38f5215664cc2f70c8d7df2d9d3',true),
('platform_transparency','0.3','Transparantieverklaring algoritmisch management (richtlijn 2024/2831)','rider',date '2026-10-15','legal/platform_transparency-v0.3.pdf','legal/platform_transparency.html','050ad6dca852ee43360df934399b09656c8c7c4d98731fd31e15e0c28067dc9c',true),
('dpia_gps','0.3','DPIA-opzet GPS-tracking en werktijdregistratie bezorgers','internal',date '2026-10-15','legal/dpia_gps-v0.3.pdf','legal/dpia_gps.html','ef80b595691a4eba6a963110d537395fef19d3b3074ff984e248164199f143b7',false),
('processing_register','0.3','Register van verwerkingsactiviteiten (art. 30 AVG)','internal',date '2026-10-15','legal/processing_register-v0.3.pdf','legal/processing_register.html','06be0405ba85c5979d2c4bf19d49635b71f2abece5082bbf4b13f7f9f3d7f7ad',false),
('rider_onboarding','0.3','Onboardingchecklist bezorger','internal',date '2026-10-15','legal/rider_onboarding-v0.3.pdf','legal/rider_onboarding.html','b9c4aeed6059a9d28b08268feabe830102ffa450267b124dfa7b26726212493d',false),
('dpa_payroll','0.1','Verwerkersovereenkomst loonadministratie (payrollprovider)','internal',date '2026-10-15','legal/dpa_payroll-v0.1.pdf','legal/dpa_payroll.html','29a8040f39bc2ac37cf0e40c4708e2dcd8603a71c67aeb84514175d43faeccc5',false)
on conflict (id, version) do update set sha256 = excluded.sha256, title = excluded.title, pdf_path = excluded.pdf_path, html_path = excluded.html_path, requires_acceptance = excluded.requires_acceptance;
insert into public.legal_acceptances(template_id, version, profile_id, lang, text_sha256, method)
select t.id, t.version, p.id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'rider' and p.is_test and ((t.id = 'rider_employment' and t.version = '0.3') or (t.id = 'platform_transparency' and t.version = '0.3'));
insert into public.legal_acceptances(template_id, version, profile_id, restaurant_id, lang, text_sha256, method)
select t.id, t.version, p.id, p.restaurant_id, 'nl', t.sha256, 'test_seed' from public.profiles p cross join public.legal_templates t
where p.role = 'restaurant' and p.is_test and p.restaurant_id is not null and t.id = 'dpa_restaurant' and t.version = '0.2';
