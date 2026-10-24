import { LegalPage } from "@/components/Legal";
import { LiveText } from "@/components/LiveBonus";

export const metadata = { title: "Terms · Food Porter" };

export default function Terms() {
  return (
    <LegalPage title={["Gebruiksvoorwaarden", "Terms of use"]} updated={["24 oktober 2026", "24 October 2026"]}
      nl={<>
      <p>Food Porter is een handelsnaam van Sonic Jobs V.O.F. (h.o.d.n. Food Porter), jouw contractspartij. Deze voorwaarden gelden voor bestellen via Food Porter tijdens de pilot in Tilburg.</p>
      <h2>1. Wat we doen</h2>
      <p>Food Porter brengt je in contact met zelfstandige Tilburgse restaurants en lokale riders. Het restaurant bereidt je eten en is verantwoordelijk voor de kwaliteit, ingrediënten en allergeneninformatie. Riders (in dienst bij Food Porter) bieden een bezorgtijd en bezorgen je bestelling.</p>
      <h2>2. Bestellen &amp; prijzen</h2>
      <ul>
        <li>Getoonde prijzen zijn inclusief btw. Bij bezorging betaal je bezorgkosten op basis van de afstand (nu <LiveText t="{FEES}" />). Bezorg- en servicekosten gaan naar Food Porter; de rider is in loondienst en krijgt uurloon plus een vaste bonus per bezorging. Fooi gaat 100% naar de rider. Daarnaast betaal je <LiveText t="{SERVICE}" /> servicekosten per bezorgbestelling. Bij afhalen betaal je geen bezorg- of servicekosten. Bij het afrekenen zie je alle kosten apart; je betaalt nooit meer dan het getoonde totaal.</li>
        <li>We bezorgen alleen binnen de pilotzone (nu <LiveText t="{ZONE}" /> km rond het centrum van Tilburg, later maximaal 10 km; de precieze straal zie je bij het afrekenen). Naar adressen buiten de zone kun je niet bestellen.</li>
        <li>Je bestelling is bevestigd zodra de betaling via Mollie (iDEAL of kaart) gelukt is.</li>
      </ul>
      <h2>3. Bezorgtijd</h2>
      <p>De verwachte tijd die je ziet is de eigen inschatting van de rider. We houden bij hoe vaak riders op tijd bezorgen, maar een verwachte tijd is geen garantie.</p>
      <h2>4. Annuleren &amp; terugbetalen</h2>
      <ul>
        <li>Als het restaurant je bestelling weigert of niet binnen 5 minuten bevestigt, wordt die geannuleerd en krijg je automatisch alles terug.</li>
        <li>Als er geen rider gevonden wordt, neemt ons team contact met je op en betalen we alles terug als we annuleren.</li>
        <li>Zodra het restaurant begonnen is met bereiden kun je niet meer annuleren (eten is bederfelijk; het herroepingsrecht geldt niet, art. 6:230p BW). Problemen met je bestelling? Meld het binnen 24 uur via Hulp en we lossen het op.</li>
        <li>Terugbetalingen gaan naar je oorspronkelijke betaalmethode, meestal binnen 1–3 werkdagen.</li>
      </ul>
      <h2>5. Alcohol &amp; leeftijd</h2>
      <p>Tijdens de pilot wordt geen alcohol verkocht.</p>
      <h2>6. Je account</h2>
      <p>Houd je inloggegevens veilig. We kunnen accounts blokkeren die de dienst misbruiken (bijv. nepbestellingen, misbruik van riders of restaurantmedewerkers, ook via de chat).</p>
      <h2>7. Aansprakelijkheid</h2>
      <p>Onze aansprakelijkheid is beperkt tot het bedrag van de betreffende bestelling, behalve bij opzet of grove nalatigheid. Nederlands recht is van toepassing.</p>
      <h2>8. Contact</h2>
      <p>support@foodporter.nl (pilotcontact, nog te bevestigen). Sonic Jobs V.O.F. h.o.d.n. Food Porter, Amarantstraat 6, 5044 RK Tilburg, KvK 42169998, btw NL870021977B01.</p>
      </>}
      en={<>
      <p>Food Porter is a trade name of Sonic Jobs V.O.F. (trading as Food Porter), your contracting party. These terms apply to ordering through Food Porter during the Tilburg pilot.</p>
      <h2>1. What we do</h2>
      <p>Food Porter connects you with independent Tilburg restaurants and local riders. The restaurant prepares your food and is responsible for its quality, ingredients and allergen information. Riders (employed by Food Porter) bid a delivery time and deliver your order.</p>
      <h2>2. Ordering &amp; prices</h2>
      <ul>
        <li>Prices shown include VAT. Delivery orders have a distance-based delivery fee (currently <LiveText isEn t="{FEES}" />). Delivery and service fees go to Food Porter; the rider is an employee with an hourly wage plus a fixed bonus per delivery. Tips go 100% to the rider. A <LiveText isEn t="{SERVICE}" /> service fee applies per delivery order. Pickup has no delivery or service fee. Checkout shows every cost separately; you never pay more than the total shown.</li>
        <li>We deliver only within the pilot zone (currently <LiveText isEn t="{ZONE}" /> km around central Tilburg, at most 10 km later; the exact radius is shown at checkout). Addresses outside the zone can’t be ordered to.</li>
        <li>Your order is confirmed when payment succeeds via Mollie (iDEAL or card).</li>
      </ul>
      <h2>3. Delivery time</h2>
      <p>The ETA you see is the rider’s own estimate. We track how often riders deliver on time, but an ETA is not a guarantee.</p>
      <h2>4. Cancellations &amp; refunds</h2>
      <ul>
        <li>If the restaurant rejects your order or doesn’t confirm it within 5 minutes, it is cancelled and you get a full automatic refund.</li>
        <li>If no rider can be found, our team contacts you and refunds in full if we cancel.</li>
        <li>Once the restaurant has started preparing, you can’t cancel (food is perishable; the right of withdrawal doesn’t apply, art. 6:230p BW). Problems with your order? Contact us within 24 hours and we’ll make it right.</li>
        <li>Refunds go back to your original payment method, usually within 1–3 working days.</li>
      </ul>
      <h2>5. Alcohol &amp; age</h2>
      <p>Alcohol is not sold during the pilot.</p>
      <h2>6. Your account</h2>
      <p>Keep your login safe. We may block accounts that misuse the service (e.g. fake orders, abuse of riders or restaurant staff).</p>
      <h2>7. Liability</h2>
      <p>Our liability is limited to the amount of the order concerned, except in case of intent or gross negligence. Dutch law applies.</p>
      <h2>8. Contact</h2>
      <p>support@foodporter.nl (pilot contact, to be confirmed). Sonic Jobs V.O.F. trading as Food Porter, Amarantstraat 6, 5044 RK Tilburg, KvK 42169998, VAT NL870021977B01.</p>
      </>} />
  );
}
