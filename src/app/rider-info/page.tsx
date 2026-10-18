import { LegalPage } from "@/components/Legal";
import { LiveBonus } from "@/components/LiveBonus";

export const metadata = { title: "Zo werken diensten en bieden · Food Porter" };

export default function RiderInfo() {
  return (
    <LegalPage title={["Zo werken diensten, bieden en toewijzen", "How shifts, bidding and assignment work"]} updated={["15 oktober 2026", "15 October 2026"]}
      nl={<>
        <p>Deze pagina legt uit hoe Food Porter beslist welke rider een bestelling krijgt (transparantie volgens de Europese richtlijn platformwerk).</p>
        <h2>Je dienstverband en loon</h2>
        <ul><li>Riders werken bij Food Porter in <b>direct dienstverband</b> (arbeidsovereenkomst), niet als zzp’er.</li><li>Je geeft in de app je beschikbaarheid op. Online gaan is <b>inklokken</b>, offline gaan is <b>uitklokken</b>.</li><li>Je krijgt <b>uurloon voor alle ingeklokte uren</b>, minimaal het cao-loon (cao Beroepsgoederenvervoer) en het minimumloon voor je leeftijd, ook als er even geen bestelling is. Op zaterdag, zondag, feestdagen, ’s nachts en bij overwerk krijg je de cao-toeslag.</li><li>Nieuwe riders krijgen een <b>min-max-contract</b> (je minimumuren worden altijd betaald). Een <b>oproepcontract</b> (0-uren, minstens 3 uur betaald per oproep) kan nog, maar is vanaf 1 januari 2028 verboden. Diensten duren meestal 3 uur. Oproepen krijg je minstens 4 dagen vooraf; later mag je weigeren.</li><li>Per bezorging komt een <b>bezorgbonus</b> bovenop je uurloon, een vast bedrag (nu <LiveBonus /> per bezorging; bestellingen betaald vóór 17 oktober 2026 houden de oude bonus), plus 100% van de fooien en 8% vakantiegeld. Je bouwt vakantie-uren op.</li><li>Het weekoverzicht in de app is indicatief; je echte loonstrook komt van de loonadministratie.</li></ul>
        <h2>Arbeidstijden</h2>
        <ul><li>Maximaal 12 uur per dienst en 60 uur per week (onder 18: 9 uur per dienst, 45 uur per week, niet tussen 23:00 en 06:00).</li><li>Na 4,5 uur werk neem je minstens 30 minuten pauze (mag in 2 × 15 minuten). De app herinnert je eraan en laat je pas weer inklokken na een pauze.</li><li>Tussen twee diensten zit minstens <b>12 uur rust</b>. De app laat zien vanaf hoe laat je weer kunt inklokken.</li><li>Bij het maximum klokt de app je automatisch uit, behalve tijdens een lopende bezorging. Een medewerker bekijkt elke melding; het systeem geeft nooit zelf een sanctie.</li></ul>
        <h2>Bieden = tijdsbelofte</h2>
        <ul><li>Zodra het restaurant een bestelling accepteert, zien alle ingeklokte riders in de buurt hem. Je belooft de tijd waarin jij het eten bij de klant kunt hebben. Dat is <b>geen prijs</b>: je loon verandert er niet door.</li><li>Je bent vrij om niet te bieden. Niet bieden heeft geen gevolgen voor je loon, je rooster of je account.</li></ul>
        <h2>Veiling</h2>
        <ul><li>Het eerste bod start een venster van ongeveer 60 seconden. Daarna wint het laagste bod (snelste tijd). Bij gelijke tijd wint het vroegste bod.</li><li>Er wordt niet gekeken naar je beoordelingen, je nationaliteit, je locatiegeschiedenis of andere persoonlijke gegevens.</li><li>Komt er geen bod, dan krijgen riders opnieuw een melding en wordt daarna het team ingeschakeld.</li></ul>
        <h2>Combineren (stapelen)</h2>
        <ul><li>Je kunt maximaal het ingestelde aantal bestellingen tegelijk hebben. Een tweede bestelling mag alleen als het restaurant binnen ongeveer 1 km ligt en de klant dezelfde kant op woont.</li><li>Je biedt dan de tijd tot deze klant zijn eten heeft, na je andere stop.</li></ul>
        <h2>Handmatig toewijzen</h2>
        <p>In uitzonderingen (geen bod, storing) kan een medewerker een bestelling met de hand aan een rider geven. Je kunt die weigeren via Hulp.</p>
        <h2>Menselijke beoordeling</h2>
        <ul><li>Een account wordt nooit automatisch geschorst. Alleen een admin kan schorsen, altijd met een geschreven reden, en elke wijziging wordt vastgelegd.</li><li>Je ziet de reden en kunt bezwaar maken via Hulp → Uitbetaling of Iets anders. Een andere medewerker kijkt er binnen 5 werkdagen naar.</li><li>Locatie wordt alleen gedeeld als je ingeklokt bent of bezorgt, en na 7 dagen verwijderd. In- en uitkloktijden bewaren we voor je loon en de Arbeidstijdenwet.</li></ul>
        <h2>Wijzigingen</h2>
        <p>Veranderen we deze regels, dan zie je dat hier en in de app, vóór de wijziging ingaat.</p>
      </>}
      en={<>
        <p>This page explains how Food Porter decides which rider gets an order (transparency under the EU Platform Work Directive).</p>
        <h2>Your employment and pay</h2>
        <ul><li>Riders work for Food Porter in <b>direct employment</b> (an employment contract), not as freelancers.</li><li>You set your availability in the app. Going online means <b>clocking in</b>, going offline means <b>clocking out</b>.</li><li>You get an <b>hourly wage for every clocked-in hour</b>, at least the CAO wage (CAO Beroepsgoederenvervoer) and the minimum wage for your age, even when there’s no order. Saturdays, Sundays, public holidays, nights and overtime pay the CAO surcharge.</li><li>New riders get a <b>min-max contract</b> (your minimum hours are always paid). An <b>on-call contract</b> (0-hours, at least 3 hours paid per call-in) is still possible but banned from 1 January 2028. Shifts usually last 3 hours. Call-ins come at least 4 days ahead; later ones you may decline.</li><li>Each delivery adds a <b>delivery bonus</b> on top of your hourly wage, a fixed amount (now <LiveBonus /> per delivery; orders paid before 17 October 2026 keep the old bonus), plus 100% of tips and 8% holiday pay. You build up holiday hours.</li><li>The weekly summary in the app is indicative; your real payslip comes from the payroll provider.</li></ul>
        <h2>Working hours</h2>
        <ul><li>At most 12 hours per shift and 60 hours per week (under 18: 9 hours per shift, 45 per week, not between 23:00 and 06:00).</li><li>After 4.5 hours of work you take at least 30 minutes’ break (2 × 15 minutes is fine). The app reminds you and only lets you clock in again after a break.</li><li>Between two shifts you get at least <b>12 hours’ rest</b>. The app shows when you can clock in again.</li><li>At the maximum the app clocks you out automatically, except during an ongoing delivery. A team member reviews every alert; the system never sanctions you by itself.</li></ul>
        <h2>Bidding = a time promise</h2>
        <ul><li>Once the restaurant accepts an order, every clocked-in rider nearby sees it. You promise the time in which you can get the food to the customer. It is <b>not a price</b>: your pay doesn’t change.</li><li>You are free not to bid. Not bidding has no effect on your pay, your schedule or your account.</li></ul>
        <h2>Auction</h2>
        <ul><li>The first bid opens a window of about 60 seconds. Then the lowest bid (fastest time) wins. On a tie, the earliest bid wins.</li><li>Ratings, nationality, location history and other personal data are not used.</li><li>If nobody bids, riders are notified again and then the team steps in.</li></ul>
        <h2>Stacking</h2>
        <ul><li>You can hold up to the configured number of orders at once. A second order is only allowed if the restaurant is within about 1 km and the customer lives in the same direction.</li><li>You then bid the time until this customer has their food, after your other stop.</li></ul>
        <h2>Manual assignment</h2>
        <p>In exceptions (no bid, an outage) a team member can give an order to a rider by hand. You can decline it through Help.</p>
        <h2>Human review</h2>
        <ul><li>Accounts are never suspended automatically. Only an admin can suspend, always with a written reason, and every change is logged.</li><li>You see the reason and can appeal through Help → Payout or Something else. A different team member reviews it within 5 working days.</li><li>Location is only shared while you are clocked in or delivering, and deleted after 7 days. Clock-in and clock-out times are kept for your pay and the Working Hours Act.</li></ul>
        <h2>Changes</h2>
        <p>If we change these rules, you will see it here and in the app before the change takes effect.</p>
      </>} />
  );
}
