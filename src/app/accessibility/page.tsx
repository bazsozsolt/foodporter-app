import { LegalPage } from "@/components/Legal";
import { COMPANY } from "@/lib/company";

export const metadata = { title: "Toegankelijkheid · Food Porter" };

export default function Accessibility() {
  return (
    <LegalPage title={["Toegankelijkheidsverklaring", "Accessibility statement"]} updated={["15 oktober 2026", "15 October 2026"]}
      nl={<>
        <p>Food Porter wil dat iedereen eten kan bestellen, bezorgen en verkopen. We streven naar <b>WCAG 2.1 niveau AA</b> (EN 301 549), zoals de Europese Toegankelijkheidswet (EAA) vraagt.</p>
        <h2>Wat we doen</h2>
        <ul><li>Contrast van tekst en knoppen minstens 4,5:1; knoppen van minstens 44 × 44 px.</li><li>Alles werkt met toetsenbord en schermlezer: zichtbare focus, labels op knoppen en velden, een link “Naar inhoud”.</li><li>Geen animaties als je “minder beweging” hebt ingesteld; tekst schaalt mee met je instellingen.</li><li>De app is in het Nederlands en Engels.</li><li>Elke update wordt automatisch getest (Lighthouse toegankelijkheid 100 op de startpagina).</li></ul>
        <h2>Bekende beperkingen</h2>
        <ul><li>De kaart (OpenStreetMap) is niet volledig met een schermlezer te gebruiken; het adres en de status staan er altijd als tekst bij.</li><li>Foto&apos;s van restaurants hebben de naam als alternatieve tekst, maar geen uitgebreide beschrijving.</li><li>De betaalpagina van Mollie valt buiten onze app.</li><li>Er is nog geen handmatige audit door een externe partij; die staat gepland vóór de publieke lancering.</li></ul>
        <h2>Contact</h2>
        <p>Loop je ergens tegenaan? Meld het via de knop Hulp in de app of mail {COMPANY.email}. We reageren binnen 5 werkdagen.</p>
      </>}
      en={<>
        <p>Food Porter wants everyone to be able to order, deliver and sell food. We aim for <b>WCAG 2.1 level AA</b> (EN 301 549), as the European Accessibility Act (EAA) requires.</p>
        <h2>What we do</h2>
        <ul><li>Text and button contrast of at least 4.5:1; tap targets of at least 44 × 44 px.</li><li>Everything works with a keyboard and screen reader: visible focus, labelled buttons and fields, a “Skip to content” link.</li><li>No animations when you set “reduce motion”; text scales with your settings.</li><li>The app is available in Dutch and English.</li><li>Every update is tested automatically (Lighthouse accessibility 100 on the home page).</li></ul>
        <h2>Known limitations</h2>
        <ul><li>The map (OpenStreetMap) is not fully usable with a screen reader; the address and status are always shown as text too.</li><li>Restaurant photos use the name as alternative text, without a longer description.</li><li>Mollie&apos;s payment page is outside our app.</li><li>No manual audit by an external party yet; it is planned before the public launch.</li></ul>
        <h2>Contact</h2>
        <p>Something not working for you? Report it with the Help button in the app or email {COMPANY.email}. We reply within 5 working days.</p>
      </>} />
  );
}
