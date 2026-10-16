-- v24: privacy statement + processing register v0.4 (support 2 years after closing, order chat 6 months after completion).
insert into public.legal_templates(id, version, title, audience, effective_date, pdf_path, html_path, sha256, requires_acceptance) values
('privacy_statement','0.4','Privacyverklaring (bewaartermijnen support en chat)','all',date '2026-10-16','legal/privacy_statement-v0.4.pdf','legal/privacy_statement.html','ec442be8f957a096dfd05e10e9851cd7b545424be6c10cdc70ba0201f409e100',false),
('processing_register','0.4','Register van verwerkingsactiviteiten (art. 30 AVG)','internal',date '2026-10-16','legal/processing_register-v0.4.pdf','legal/processing_register.html','c7d1cc6fb4e66a84fdf7160cf7ee615db95fcd5632c92698b4d233112ca5ce81',false);
