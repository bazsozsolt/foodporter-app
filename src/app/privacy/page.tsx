import { LegalPage } from "@/components/Legal";
import { DataExport } from "./DataExport";

export const metadata = { title: "Privacy policy · Food Porter" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="13 October 2026">
      <p>Food Porter (“we”) runs a food delivery pilot in Tilburg, the Netherlands. This policy explains which personal data we process, why, and your rights under the GDPR (AVG).</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account:</b> email address, name (optional), role, and sign-in data from Google/Apple if you use them.</li>
        <li><b>Orders:</b> delivery address and its map coordinates, phone number, items, amounts, timestamps, ratings and comments.</li>
        <li><b>Payments:</b> processed by Mollie B.V. We store the payment id and status, never your card or bank details.</li>
        <li><b>Riders:</b> name, phone, IBAN (for payouts), bids, delivery times and earnings.</li>
        <li><b>Restaurants:</b> business contact details, menu and order handling times.</li>
      </ul>
      <h2>Why (legal basis)</h2>
      <ul>
        <li>To deliver your order and send status SMS: <i>performance of a contract</i>.</li>
        <li>To pay riders and restaurants, keep accounting records (7 years) and prevent fraud: <i>legal obligation / legitimate interest</i>.</li>
        <li>To measure and improve the service (e.g. % of orders delivered on time): <i>legitimate interest</i>, using aggregated data.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>The restaurant and the assigned rider see what they need for your order (items, address, phone). Processors: Supabase (database &amp; login, EU region), Mollie (payments, NL), PDOK/Kadaster (address lookup, NL), our SMS provider (Twilio or Bird) and GitHub Pages (hosting the app files). We do not sell data or use advertising trackers.</p>
      <h2>How long</h2>
      <p>Order and payment records: 7 years (Dutch tax law). Account data: until you delete your account. Ratings: until you ask us to remove them.</p>
      <h2>Your rights</h2>
      <p>You can access, correct, export or delete your data, object to processing, and complain to the Autoriteit Persoonsgegevens. Download your data below; for deletion or questions contact us at <b>privacy@foodporter.nl</b> (pilot contact, to be confirmed). We reply within 30 days.</p>
      <DataExport />
    </LegalPage>
  );
}
