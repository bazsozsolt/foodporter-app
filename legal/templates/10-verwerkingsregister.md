---
id: processing_register
title: Register van verwerkingsactiviteiten (art. 30 AVG)
version: 0.1
audience: internal
---
# Verwerkingsregister
> **Concept – laat beoordelen door een Nederlandse jurist voor gebruik.** Dit is geen juridisch advies. Placeholders: {{BEDRIJFSNAAM}}, {{KVK}}, {{ADRES}}, {{COMMISSIE_PCT}}. / *Draft – have it reviewed by a Dutch lawyer before use. Not legal advice.*

| # | Verwerking | Betrokkenen | Categorieën | Doel | Grondslag | Ontvangers | Termijn | Beveiliging |
|---|---|---|---|---|---|---|---|---|
| 1 | Klantaccount en bestellingen | klanten | NAW, contact, bestellingen | levering | overeenkomst | restaurant, bezorger, Supabase | 7 jr (fiscaal) | RLS, TLS |
| 2 | Betalingen | klanten | betaalstatus, Mollie-ID | betaling, terugbetaling | overeenkomst, wettelijk | Mollie | 7 jr | geen kaartdata opgeslagen |
| 3 | Bezorgeronboarding | bezorgers | ID-controle, geboortedatum, verblijfsrecht, KvK | identificatieplicht, leeftijd | wettelijk, overeenkomst | admin | relatie + 5 jr | aparte private opslag |
| 4 | GPS tijdens online-zijn | bezorgers | locatie | zone-toewijzing, tracking, ETA, veiligheid | overeenkomst, GB (DPIA) | admin; klant en restaurant alleen tijdens eigen bezorging | 7 dagen | RLS |
| 5 | Afleverfoto | bezorger, klant(adres) | foto deur | bewijs | overeenkomst | klant, admin | 30 dagen | private bucket, signed URL |
| 6 | Support en chat | iedereen | berichten, foto's | klachtafhandeling | overeenkomst | admin | 2 jr | RLS |
| 7 | Contractacceptatie | bezorgers, restaurants | versie, tijd, IP, user-agent | bewijs akkoord | GB | admin | relatie + 5 jr | append-only log |
| 8 | DAC7 | restaurants, (zzp-)bezorgers | NAW, TIN, IBAN, omzet | rapportage | wettelijk | Belastingdienst | 10 jr | admin-only |
| 9 | Push en SMS | klanten, bezorgers | push-endpoint, telefoon | meldingen | toestemming / overeenkomst | FCM/APNs/autopush, SMS-provider | tot afmelding | service-role only |
| 10 | Accountstatus en deactivatie | bezorgers, restaurants | reden, besluit | menselijk besluit, bezwaar | GB | admin | relatie + 2 jr | append-only |

---
**English summary.** An Art. 30 GDPR record of processing for 10 processing activities (accounts, payments, onboarding, GPS, photo proof, support, contract e-sign, DAC7, push/SMS, account status), with legal basis, recipients, retention and security per activity.
