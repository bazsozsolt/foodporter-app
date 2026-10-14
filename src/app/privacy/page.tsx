import { LegalPage } from "@/components/Legal";
import { DataExport } from "./DataExport";

export const metadata = { title: "Privacy policy · Food Porter" };

export default function Privacy() {
  return (
    <LegalPage title={["Privacybeleid", "Privacy policy"]} updated={["14 oktober 2026", "14 October 2026"]}
      nl={<>
      <p>Food Porter (“wij”) voert een pilot voor maaltijdbezorging uit in Tilburg. Dit beleid legt uit welke persoonsgegevens we verwerken, waarom, en welke rechten je hebt onder de AVG.</p>
      <h2>Wat we verzamelen</h2>
      <ul>
        <li><b>Account:</b> e-mailadres, naam (optioneel), rol, en inloggegevens van Google/Apple als je die gebruikt.</li>
        <li><b>Bestellingen:</b> bezorgadres en de kaartcoördinaten daarvan, telefoonnummer, items, bedragen, tijdstippen, beoordelingen en opmerkingen.</li>
        <li><b>Betalingen:</b> verwerkt door Mollie B.V. We bewaren het betalings-id en de status, nooit je kaart- of bankgegevens.</li>
        <li><b>Riders:</b> naam, telefoon, IBAN (voor uitbetalingen), biedingen, bezorgtijden en verdiensten.</li>
        <li><b>Locatie van riders (GPS):</b> alleen na toestemming van de rider, en alleen terwijl die <i>online</i> is of bezorgt: positie, nauwkeurigheid, snelheid en richting, ongeveer elke 7 seconden.</li>
        <li><b>Restaurants:</b> zakelijke contactgegevens, menu en verwerkingstijden van bestellingen.</li>
        <li><b>Chat en bellen:</b> berichten in de chat bij een bestelling, en een log (wie, wanneer) als je via de app de rider of klant belt. Je telefoonnummer wordt alleen tijdens een actieve bezorging aan de andere partij gegeven.</li>
        <li><b>Hulpmeldingen:</b> je melding, eventuele foto en, bij SOS, je locatie.</li>
      </ul>
      <h2>Waarom (grondslag)</h2>
      <ul>
        <li>Om je bestelling te bezorgen en status-sms’jes te sturen: <i>uitvoering van een overeenkomst</i>.</li>
        <li>Om riders en restaurants te betalen, de administratie te bewaren (7 jaar) en fraude te voorkomen: <i>wettelijke verplichting / gerechtvaardigd belang</i>.</li>
        <li>Om de dienst te meten en te verbeteren (bijv. % op tijd bezorgd): <i>gerechtvaardigd belang</i>, met geaggregeerde gegevens.</li>
      </ul>
      <h2>Feedback</h2>
      <p>Als je &quot;Feedback geven&quot; gebruikt, bewaren we je bericht, optionele sterren en e-mail, de pagina waar je was, je browsertype en (als je ingelogd bent) je account. Alleen beheerders van Food Porter kunnen dit lezen; we verwijderen het als de pilot afloopt of op verzoek.</p>
      <h2>Live locatie</h2>
      <p>Riders kiezen zelf wanneer ze delen: online gaan start het delen, offline gaan (zonder lopende bezorging) stopt het. Tijdens een actieve bezorging kunnen de <b>klant</b> en het <b>restaurant</b> van die bestelling de rider op een kaart zien; na de bezorging niet meer. Onze beheerders zien online riders voor planning en veiligheid. Niemand anders kan locaties zien (afgedwongen in de database). Locatiepunten worden <b>na 7 dagen automatisch verwijderd</b>. Grondslag: toestemming van de rider (op elk moment in te trekken door offline te gaan) en, tijdens een bezorging, uitvoering van de overeenkomst met de klant. Kaarten gebruiken tegels van OpenStreetMap (OpenStreetMap Foundation), die je IP-adres ontvangen als de kaart laadt.</p>
      <h2>Met wie we het delen</h2>
      <p>Het restaurant en de toegewezen rider zien wat ze nodig hebben voor je bestelling (items, adres; de rider ziet je telefoonnummer alleen via de belknop tijdens de bezorging). Verwerkers: Supabase (database &amp; inloggen, EU-regio), Mollie (betalingen, NL), PDOK/Kadaster (adres opzoeken, NL), OpenStreetMap (kaarttegels), onze sms-aanbieder (Twilio of Bird) en GitHub Pages (hosting van de app-bestanden). We verkopen geen gegevens en gebruiken geen advertentietrackers.</p>
      <h2>Hoe lang</h2>
      <p>Bestel- en betaalgegevens: 7 jaar (Nederlandse fiscale wet). Accountgegevens: tot je je account verwijdert. Beoordelingen: tot je vraagt ze te verwijderen. GPS-punten van riders: 7 dagen.</p>
      <h2>Je rechten</h2>
      <p>Je kunt je gegevens inzien, corrigeren, exporteren of laten verwijderen, bezwaar maken tegen verwerking, en een klacht indienen bij de Autoriteit Persoonsgegevens. Download je gegevens hieronder; voor verwijdering of vragen mail je naar <b>privacy@foodporter.nl</b> (pilotcontact, nog te bevestigen). We reageren binnen 30 dagen.</p>
      <DataExport />
      </>}
      en={<>
      <p>Food Porter (“we”) runs a food delivery pilot in Tilburg, the Netherlands. This policy explains which personal data we process, why, and your rights under the GDPR (AVG).</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> email address, name (optional), role, and sign-in data from Google/Apple if you use them.</li>
        <li><b>Orders:</b> delivery address and its map coordinates, phone number, items, amounts, timestamps, ratings and comments.</li>
        <li><b>Payments:</b> processed by Mollie B.V. We store the payment id and status, never your card or bank details.</li>
        <li><b>Riders:</b> name, phone, IBAN (for payouts), bids, delivery times and earnings.</li>
        <li><b>Rider location (GPS):</b> only after the rider consents, and only while they are <i>online</i> or on a delivery: position, accuracy, speed and heading, about every 7 seconds.</li>
        <li><b>Restaurants:</b> business contact details, menu and order handling times.</li>
        <li><b>Chat and calls:</b> messages in an order’s chat, and a log (who, when) when you call the rider or customer through the app. Your phone number is only given to the other party during an active delivery.</li>
        <li><b>Help requests:</b> your report, an optional photo and, for SOS, your location.</li>
      </ul>
      <h2>Why (legal basis)</h2>
      <ul>
        <li>To deliver your order and send status SMS: <i>performance of a contract</i>.</li>
        <li>To pay riders and restaurants, keep accounting records (7 years) and prevent fraud: <i>legal obligation / legitimate interest</i>.</li>
        <li>To measure and improve the service (e.g. % of orders delivered on time): <i>legitimate interest</i>, using aggregated data.</li>
      </ul>
      <h2>Feedback</h2>
      <p>If you use &quot;Give feedback&quot;, we store your message, optional star rating and email, the page you were on, your browser type and (if signed in) your account. Only Food Porter admins can read it; we delete it when the pilot ends or on request.</p>
      <h2>Live location</h2>
      <p>Riders choose when to share: going online starts sharing, going offline (with no delivery in progress) stops it. While a delivery is active, its <b>customer</b> and <b>restaurant</b> can see the rider on a map; after delivery they can no longer see it. Our admins can see online riders for dispatch and safety. Nobody else can see locations (enforced in the database). Location points are <b>automatically deleted after 7 days</b>. Legal basis: the rider’s consent (withdraw any time by going offline) and, during a delivery, performance of the contract with the customer. Maps use OpenStreetMap tiles (OpenStreetMap Foundation), which receive your IP address when the map loads.</p>
      <h2>Who we share it with</h2>
      <p>The restaurant and the assigned rider see what they need for your order (items, address; the rider only gets your phone number through the call button during delivery). Processors: Supabase (database &amp; login, EU region), Mollie (payments, NL), PDOK/Kadaster (address lookup, NL), OpenStreetMap (map tiles), our SMS provider (Twilio or Bird) and GitHub Pages (hosting the app files). We do not sell data or use advertising trackers.</p>
      <h2>How long</h2>
      <p>Order and payment records: 7 years (Dutch tax law). Account data: until you delete your account. Ratings: until you ask us to remove them. Rider GPS points: 7 days.</p>
      <h2>Your rights</h2>
      <p>You can access, correct, export or delete your data, object to processing, and complain to the Autoriteit Persoonsgegevens. Download your data below; for deletion or questions contact us at <b>privacy@foodporter.nl</b> (pilot contact, to be confirmed). We reply within 30 days.</p>
      <DataExport />
      </>} />
  );
}
