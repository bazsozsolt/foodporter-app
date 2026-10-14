import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Cookies · Food Porter" };

export default function Cookies() {
  return (
    <LegalPage title={["Cookiebeleid", "Cookie policy"]} updated={["13 oktober 2026", "13 October 2026"]}
      nl={<>
      <p>Food Porter gebruikt <b>geen tracking- of advertentiecookies</b> en geen analytics van derden, daarom tonen we geen cookiebanner.</p>
      <h2>Wat we op je apparaat bewaren</h2>
      <ul>
        <li><b>Inlogsessie</b> (local storage van de browser, gezet door Supabase Auth): houdt je ingelogd. Strikt noodzakelijk.</li>
        <li><b>Je winkelmand</b> (local storage): onthoudt wat je hebt gekozen. Strikt noodzakelijk.</li>
        <li><b>Meldingsvoorkeur</b> (local storage, restaurants/riders): of geluidsmeldingen aan staan.</li>
        <li><b>Offline cache</b> (service worker): app-bestanden, zodat de app snel opent en als geïnstalleerde app werkt.</li>
        <li><b>Taalkeuze</b> (local storage): Nederlands of Engels.</li>
      </ul>
      <p>Tijdens het betalen ga je naar Mollie, dat eigen strikt noodzakelijke cookies gebruikt (zie mollie.com/privacy).</p>
      <p>Je kunt dit alles op elk moment wissen in je browserinstellingen; je wordt dan uitgelogd en je winkelmand wordt geleegd.</p>
      </>}
      en={<>
      <p>Food Porter uses <b>no tracking or advertising cookies</b> and no third-party analytics, so we don’t show a cookie banner.</p>
      <h2>What we store on your device</h2>
      <ul>
        <li><b>Login session</b> (browser local storage, set by Supabase Auth): keeps you signed in. Strictly necessary.</li>
        <li><b>Your cart</b> (local storage): remembers what you picked. Strictly necessary.</li>
        <li><b>Alert preference</b> (local storage, restaurants/riders): whether sound alerts are on.</li>
        <li><b>Offline cache</b> (service worker): app files, so the app opens fast and works as an installed app.</li>
      </ul>
      <p>During payment you are redirected to Mollie, which uses its own strictly necessary cookies (see mollie.com/privacy).</p>
      <p>You can clear all of this at any time in your browser settings; you will be signed out and your cart emptied.</p>
      </>} />
  );
}
