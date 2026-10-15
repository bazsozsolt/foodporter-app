# Food Porter – compliance checklist (v20)
> **Concept – laat beoordelen door een Nederlandse jurist voor gebruik.** Status per 15-10-2026. ✅ = in de app/templates, ☐ = nog door Zsolt te regelen, ⚖ = jurist laten bevestigen.

## Arbeidsrecht (BW 7, Wab, Wtvaa)
- ✅ Direct dienstverband, geen zzp (Deliveroo-arrest HR 2023:1622). ✅ Contractvorm per bezorger: oproep (0 uur) of min-max.
- ✅ Oproep: min. 3 uur per oproep, 4 dagen oproeptermijn (weigeren bij later), annulering < 4 dagen betaald, aanbod vaste uren na 12 maanden (melding + "Offer made").
- ✅ Min-max: minimumuren altijd betaald. ⚖ Overwerkdrempel (max-uren vs. 40 uur) en stapelen van dag- en nachttoeslag.
- ✅ Proeftijd: geen bij ≤ 6 mnd, max 1 mnd bij > 6 mnd en < 2 jr. ✅ Aanzegging, ketenregeling, geen concurrentiebeding, nevenwerk toegestaan, gratis verplichte scholing, informatieplicht 7:655 (referentiedagen).
- ☐ Kies contractduur per bezorger en vul de placeholders in ({{BEDRIJFSNAAM}}, {{KVK}}, {{ADRES}}, {{PAYROLL_PROVIDER}}, {{ARBODIENST}}).

## CAO en loon
- ✅ CAO Beroepsgoederenvervoer (AVV tot 1-1-2027): jeugdlonen in % van het WML, 21+ = max(WML, A1), toeslagen za 50 / zo 100 / feestdag 100 / nacht 19 / overwerk 30, pauze na 4,5 uur, vakantie-uren 10,58%, alles instelbaar (Settings → CAO).
- ☐ Agenda: controleer de AVV-verlenging vóór 1-1-2027 en de nieuwe loontabellen (1 januari en 1 juli). ⚖ Functie-indeling (A1?), ATV, cao-vakantiedagen voor jongeren, cao-ziektegeldaanvulling, art. 6.1 (geen bezorgers met een fulltimebaan elders?).
- ☐ Pensioenfonds Vervoer: aanmelding werkgever, premie (placeholder in Settings).

## Arbeidstijdenwet
- ✅ Max 12 u/dienst, 60 u/week, gemiddeld 48 u/16 wk (melding); jeugd 9 u / 45 u / gemiddeld 40 u per 4 wk, niet 23–06; pauze 30 min na 4,5 u (cao); **12 u rust** (blokkade); 13 vrije zondagen (melding). Registratie 52 weken+ bewaard.

## Arbowet
- ☐ RI&E met plan van aanpak, laten **toetsen** door een gecertificeerde deskundige (> 25 werknemers of geen branche-RI&E). ☐ Basiscontract arbodienst/bedrijfsarts. ☐ Preventiemedewerker aanwijzen. ☐ Verzuimprotocol (Wet verbetering poortwachter); geen medische gegevens in de app ✅.
- ✅ Gedragscode, veiligheidsinstructie, uitrusting en ongevalsregistratie.

## Identiteit, Wav en loonheffing
- ✅ ID-controle in persoon of via video, recht op werk en leeftijd (vinkjes + vervaldatum). ☐ De **ID-kopie** wordt bewaard bij de loonadministratie (wettelijk verplicht, 5 jaar na einde dienstverband), niet in de app.
- ✅ BSN, loonheffingskorting en loonstroken alleen bij de payrollprovider. ☐ Kies de provider, teken template 13 (DPA loonadministratie) en stel het exportformaat af (payroll-export-spec.md).
- ☐ Loonheffingennummer aanvragen, eerstedagsmelding, aansluiting UWV/sectorfonds (sector vervoer).

## WAADI / Wtta
- ✅ Geen uitzend- of payrollconstructie: werkgever = Food Porter. ⚖ Als een **payrollbedrijf** juridisch werkgever wordt: WAADI-registratie, art. 7:692 BW (gelijke behandeling) en vanaf 2027 de **Wtta-toelating** (verplichte certificering). In dat geval is template 13 niet het juiste contract.

## Privacy (AVG/UAVG) en Platform Work Directive
- ✅ Privacyverklaring v0.3, verwerkingsregister v0.3 (payrollprovider, pensioenfonds, rooster), DPIA v0.3, transparantieverklaring v0.3 (oproepen, rust, loonberekening), menselijke beoordeling van meldingen, geen geautomatiseerde sancties.
- ☐ DPIA laten afronden en ondertekenen; FG-afweging; ondernemingsraad/PVT bij ≥ 10 werknemers (instemming bij personeelsvolgsystemen, art. 27 WOR).
- ⚖ Implementatie van de Platform Work Directive (EU 2024/2831) in NL vóór 2-12-2026: informatieplicht, menselijk toezicht en de inventaris van systemen opnieuw toetsen.

## VBAR
- ✅ Platform werkt met eigen werknemers (geen tussenpersoon). ⚖ Bevestig dat er geen VBAR-registratie of -verplichting geldt.

## Restaurants en klanten
- ✅ Partner-DPA v0.2 (payrollprovider is geen subverwerker voor restaurantdata), algemene voorwaarden, DAC7-velden.
