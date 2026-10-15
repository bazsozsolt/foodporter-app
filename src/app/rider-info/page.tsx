import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Zo werkt bieden · Food Porter" };

export default function RiderInfo() {
  return (
    <LegalPage title={["Zo werken bieden en toewijzen", "How bidding and assignment work"]} updated={["15 oktober 2026", "15 October 2026"]}
      nl={<>
        <p>Deze pagina legt uit hoe Food Porter beslist welke rider een bestelling krijgt (transparantie volgens de Europese richtlijn platformwerk).</p>
        <h2>Bieden</h2>
        <ul><li>Zodra het restaurant een bestelling accepteert, zien alle online riders in de buurt hem. Je biedt de tijd waarin jij het eten bij de klant kunt hebben.</li><li>Je bent vrij om niet te bieden. Niet bieden of offline gaan heeft geen gevolgen voor je account of je toekomstige opdrachten.</li><li>De bezorgvergoeding is voor iedereen gelijk en gaat 100% naar de rider, net als fooien.</li></ul>
        <h2>Veiling</h2>
        <ul><li>Het eerste bod start een venster van ongeveer 60 seconden. Daarna wint het laagste bod (snelste tijd). Bij gelijke tijd wint het vroegste bod.</li><li>Er wordt niet gekeken naar je beoordelingen, je nationaliteit, je locatiegeschiedenis of andere persoonlijke gegevens.</li><li>Komt er geen bod, dan krijgen riders opnieuw een melding en wordt daarna het team ingeschakeld.</li></ul>
        <h2>Combineren (stapelen)</h2>
        <ul><li>Je kunt maximaal het ingestelde aantal bestellingen tegelijk hebben. Een tweede bestelling mag alleen als het restaurant binnen ongeveer 1 km ligt en de klant dezelfde kant op woont.</li><li>Je biedt dan de tijd tot deze klant zijn eten heeft, na je andere stop.</li></ul>
        <h2>Handmatig toewijzen</h2>
        <p>In uitzonderingen (geen bod, storing) kan een medewerker een bestelling met de hand aan een rider geven. Je kunt die weigeren via Hulp.</p>
        <h2>Menselijke beoordeling</h2>
        <ul><li>Een account wordt nooit automatisch geschorst. Alleen een admin kan schorsen, altijd met een geschreven reden, en elke wijziging wordt vastgelegd.</li><li>Je ziet de reden en kunt bezwaar maken via Hulp → Uitbetaling of Iets anders. Een andere medewerker kijkt er binnen 5 werkdagen naar.</li><li>Locatie wordt alleen gedeeld als je online bent of bezorgt, en na 7 dagen verwijderd.</li></ul>
        <h2>Wijzigingen</h2>
        <p>Veranderen we deze regels, dan zie je dat hier en in de app, vóór de wijziging ingaat.</p>
      </>}
      en={<>
        <p>This page explains how Food Porter decides which rider gets an order (transparency under the EU Platform Work Directive).</p>
        <h2>Bidding</h2>
        <ul><li>Once the restaurant accepts an order, every online rider nearby sees it. You bid the time in which you can get the food to the customer.</li><li>You are free not to bid. Not bidding or going offline has no effect on your account or future jobs.</li><li>The delivery fee is the same for everyone and goes 100% to the rider, as do tips.</li></ul>
        <h2>Auction</h2>
        <ul><li>The first bid opens a window of about 60 seconds. Then the lowest bid (fastest time) wins. On a tie, the earliest bid wins.</li><li>Ratings, nationality, location history and other personal data are not used.</li><li>If nobody bids, riders are notified again and then the team steps in.</li></ul>
        <h2>Stacking</h2>
        <ul><li>You can hold up to the configured number of orders at once. A second order is only allowed if the restaurant is within about 1 km and the customer lives in the same direction.</li><li>You then bid the time until this customer has their food, after your other stop.</li></ul>
        <h2>Manual assignment</h2>
        <p>In exceptions (no bid, an outage) a team member can give an order to a rider by hand. You can decline it through Help.</p>
        <h2>Human review</h2>
        <ul><li>Accounts are never suspended automatically. Only an admin can suspend, always with a written reason, and every change is logged.</li><li>You see the reason and can appeal through Help → Payout or Something else. A different team member reviews it within 5 working days.</li><li>Location is only shared while you are online or delivering, and deleted after 7 days.</li></ul>
        <h2>Changes</h2>
        <p>If we change these rules, you will see it here and in the app before the change takes effect.</p>
      </>} />
  );
}
