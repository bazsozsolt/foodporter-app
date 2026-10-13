import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Cookies · Food Porter" };

export default function Cookies() {
  return (
    <LegalPage title="Cookie policy" updated="13 October 2026">
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
    </LegalPage>
  );
}
