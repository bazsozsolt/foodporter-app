---
id: dpa_restaurant
title: Verwerkersovereenkomst (DPA) restaurant + subverwerkers
version: 0.4
audience: restaurant
---
# Verwerkersovereenkomst (art. 28 AVG)
> **Concept – laat beoordelen door een Nederlandse jurist voor gebruik.** Dit is geen juridisch advies. Placeholders: {{COMMISSIE_PCT}}. / *Draft – have it reviewed by a Dutch lawyer before use. Not legal advice.*

**Partijen.** [Restaurant] ("Verwerkingsverantwoordelijke" voor klantgegevens die zij voor haar eigen verkoop gebruikt) en **Sonic Jobs V.O.F.** h.o.d.n. Food Porter ("Verwerker" voor zover zij namens het restaurant bestellingen ontvangt, doorgeeft en bewaart).
*Toelichting:* voor de eigen platformdiensten (account, betaling, bezorging) is Food Porter zelf verantwoordelijk; deze DPA ziet alleen op de verwerking **namens** het restaurant.

1. **Onderwerp en duur:** het verwerken van bestelgegevens (naam, telefoon, adres, bestelregels, opmerkingen, allergievragen) zolang de partnerovereenkomst loopt.
2. **Instructies:** de verwerker verwerkt alleen op schriftelijke instructie (deze overeenkomst en de app-instellingen).
3. **Geheimhouding:** personeel met toegang is tot geheimhouding verplicht.
4. **Beveiliging (art. 32):** encryptie in transit (TLS), Row Level Security per rol, least privilege, logging, back-ups, MFA voor beheerders, test- en productiegegevens gescheiden.
5. **Subverwerkers:** algemene toestemming voor de lijst hieronder; wijzigingen worden 30 dagen vooraf gemeld met een bezwaarrecht.
6. **Bijstand:** bij verzoeken van betrokkenen en bij een DPIA.
7. **Datalekken:** melding aan de verwerkingsverantwoordelijke **zonder onredelijke vertraging, uiterlijk binnen 36 uur** na ontdekking.
8. **Verwijderen/teruggeven:** binnen 30 dagen na het einde, behalve wat de wet verplicht te bewaren.
9. **Audit:** eens per jaar een informatieverzoek of een audit op kosten van de aanvrager.
10. **Doorgifte:** buiten de EER alleen met passende waarborgen.

### Bijlage – subverwerkers
| Subverwerker | Dienst | Locatie / waarborg |
|---|---|---|
| Supabase Inc. | database, auth, bestandsopslag, edge functions | EU-regio (project); DPA + SCC/DPF |
| Mollie B.V. | betaalverwerking | Nederland (EU) |
| GitHub Inc. (Pages) | hosting van de statische app (geen opslag van persoonsgegevens) | VS; DPF/SCC |
| Google (FCM), Apple (APNs), Mozilla (autopush) | doorgifte van pushberichten aan de browser van de klant | VS/EU; DPF/SCC |

*De loonadministratie/payrollprovider van Food Porter ({{PAYROLL_PROVIDER}}) verwerkt alleen gegevens van bezorgers (werknemers) en **geen** gegevens van het restaurant of van klanten; zij is daarom geen subverwerker onder deze overeenkomst (zie de aparte verwerkersovereenkomst loonadministratie).*
| [SMS-provider] | SMS-statusberichten (optioneel) | [ ] |

---
**English summary.** An Art. 28 GDPR processing agreement covering only what Food Porter processes on the restaurant's behalf (order data); for its own platform services Food Porter is controller. Instructions, confidentiality, security measures (TLS, RLS, MFA, logs), a sub-processor list with 30 days' notice of changes, breach notice within 36 hours, deletion within 30 days, a yearly audit right, and transfer safeguards.
