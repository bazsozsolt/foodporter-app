---
id: dpa_payroll
title: Verwerkersovereenkomst loonadministratie (payrollprovider)
version: 0.1
audience: internal
---
# Verwerkersovereenkomst loonadministratie (art. 28 AVG)
> **Concept – laat beoordelen door een Nederlandse jurist voor gebruik.** Dit is geen juridisch advies. Placeholders: {{BEDRIJFSNAAM}}, {{KVK}}, {{ADRES}}, {{PAYROLL_PROVIDER}}. / *Draft – have it reviewed by a Dutch lawyer before use. Not legal advice.*

**Partijen.** {{BEDRIJFSNAAM}}, {{ADRES}}, KvK {{KVK}} ("Verwerkingsverantwoordelijke", de werkgever) en {{PAYROLL_PROVIDER}} ("Verwerker"). *Let op: dit is een verwerkersovereenkomst voor een loonadministratiekantoor of salarissoftware. Een **payrollbedrijf** dat zelf juridisch werkgever wordt, valt onder een andere constructie (art. 7:692 BW, WAADI-registratie) en vraagt een ander contract.*

1. **Onderwerp:** het voeren van de loonadministratie voor de bezorgers (werknemers) van de verwerkingsverantwoordelijke: loonberekening, loonstroken, loonaangifte, jaaropgaven, pensioenaangifte bij Pensioenfonds Vervoer en betaalbestanden.
2. **Gegevens:** (a) uit de app, wekelijks als export volgens de *Payroll export spec*: werknemersreferentie, naam, e-mail, contractvorm, uren, garantie-uren, toeslagen, bezorgbonus, fooien, vakantietoeslag en -uren, leeftijd voor het jeugdloon; (b) **rechtstreeks van de werknemer, buiten de app:** BSN, opgaaf loonheffingen (loonheffingskorting), kopie identiteitsbewijs, IBAN, adres. De app slaat geen BSN, loonheffingskorting of loonstroken op.
3. **Instructies:** de verwerker verwerkt alleen op schriftelijke instructie. Controle op het wettelijk minimumloon en het cao-loon blijft de verantwoordelijkheid van de werkgever; de verwerker meldt afwijkingen.
4. **Geheimhouding** voor het personeel van de verwerker.
5. **Beveiliging (art. 32 AVG):** encryptie, MFA, toegang op basis van rol, logging, bewaartermijnen (loonadministratie 7 jaar; ID-kopie tot 5 jaar na het einde van het dienstverband), werknemersportaal voor loonstroken.
6. **Subverwerkers** alleen met voorafgaande schriftelijke toestemming; een lijst als bijlage.
7. **Datalekken:** melding zonder onredelijke vertraging, uiterlijk binnen 24 uur na ontdekking.
8. **Bijstand** bij rechten van betrokkenen, DPIA's en vragen van de AP of de Belastingdienst.
9. **Einde:** teruggave of vernietiging, behalve de fiscale bewaarplicht.
10. **Audit:** jaarlijks een ISAE 3402- of ISO 27001-verklaring of een audit.
11. **Locatie:** verwerking binnen de EER.

Getekend (elektronisch): ______

---
**English summary.** Processing agreement with the payroll administration provider (a placeholder until one is chosen). The app sends a weekly provider-neutral export: hours, guarantee hours, surcharges, bonus, tips and holiday pay. The rider gives BSN, tax-credit form, ID copy and IBAN directly to the provider; the app stores none of these. Covers the security, breach notice (24 h), sub-processor, audit, EEA and retention clauses. Note: a payroll company that becomes the legal employer needs a different construction (art. 7:692 BW, WAADI).
