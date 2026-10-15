---
id: dpia_gps
title: DPIA-opzet GPS-tracking en werktijdregistratie bezorgers
version: 0.2
audience: internal
---
# DPIA – GPS-tracking (opzet)
> **Concept – laat beoordelen door een Nederlandse jurist voor gebruik.** Dit is geen juridisch advies. Placeholders: {{BEDRIJFSNAAM}}, {{KVK}}, {{ADRES}}, {{COMMISSIE_PCT}}. / *Draft – have it reviewed by a Dutch lawyer before use. Not legal advice.*

**Waarom verplicht:** de AP-lijst (Stcrt. 2019, 64418) noemt de stelselmatige monitoring van werkenden, inclusief GPS, en grootschalige locatiegegevens.
1. **Beschrijving:** de rider-app stuurt tijdens een actieve bezorging (status toegewezen → geleverd) elke [10–30] s de locatie; de klant ziet een kaart en de ETA, en het restaurant ziet de aankomst.
2. **Doelen:** live status voor de klant, betere ETA's, veiligheid (SOS) en het oplossen van geschillen over de levering.
3. **Noodzaak en proportionaliteit:** alleen terwijl de bezorger online staat (nodig voor zone-toewijzing); geen tracking als de bezorger offline is; klant en restaurant zien de locatie alleen tijdens hun eigen bezorging; precisie beperkt in de klantweergave; geen gebruik voor prestatiebeoordeling of sancties; ruwe punten na 7 dagen automatisch verwijderd.
4. **Risico's:** het profileren van werkgedrag, ongeoorloofde toegang (klant ziet bezorgers buiten de eigen bestelling), een datalek met woon-werkpatronen, druk om te haasten.
5. **Maatregelen:** RLS (alleen de betrokken klant, het restaurant en de admin), automatische verwijdering, geen export, logging van admin-inzage, transparantieverklaring, inspraak (OR of riderpanel), een jaarlijkse herbeoordeling.
6. **Restrisico en besluit:** [laag/midden] – [akkoord FG/directie, datum].
6a. **Werktijdregistratie (v19):** in- en uitkloktijden, beschikbaarheid, pauzes en meldingen over de Arbeidstijdenwet. Doel: uurloon, loonadministratie en naleving. Alleen de bezorger zelf en admins zien deze gegevens; geen gebruik voor ranking of toewijzing; meldingen worden altijd door een mens beoordeeld; export alleen als CSV voor de loonadministratie; bewaartermijn 7 jaar (fiscaal). Risico: werkdruk en controle; maatregel: geen sancties door het systeem, alleen blokkeren van inklokken waar de wet dat vereist.
7. **Raadpleging:** riders of hun vertegenwoordiging (verplicht onder richtlijn 2024/2831 art. 13 bij wijzigingen).

---
**English summary.** A DPIA outline for rider GPS, mandatory under the AP list. It covers scope (while clocked in), purposes, necessity, risks (profiling, access, breaches, pressure to hurry), plus working-time records (clock-in/out, breaks, ATW alerts: own rider + admin only, no ranking, CSV only for payroll, 7 years), mitigations (RLS, 7-day GPS deletion, no use for performance sanctions, logging, rider consultation) and the sign-off.
