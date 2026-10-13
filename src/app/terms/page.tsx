import { LegalPage } from "@/components/Legal";

export const metadata = { title: "Terms · Food Porter" };

export default function Terms() {
  return (
    <LegalPage title="Terms of use" updated="13 October 2026">
      <p>These terms apply to ordering through Food Porter during the Tilburg pilot.</p>
      <h2>1. What we do</h2>
      <p>Food Porter connects you with independent Tilburg restaurants and local riders. The restaurant prepares your food and is responsible for its quality, ingredients and allergen information. Independent riders bid a delivery time and deliver your order.</p>
      <h2>2. Ordering &amp; prices</h2>
      <ul>
        <li>Prices shown include VAT. A flat delivery fee applies (currently €2.50–€3.50); riders keep 100% of it.</li>
        <li>We deliver only within the pilot zone (about 3 km around central Tilburg). Addresses outside the zone can’t be ordered to.</li>
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
      <p>support@foodporter.nl (pilot contact, to be confirmed). Company details (KvK number, address) will be added before public launch.</p>
    </LegalPage>
  );
}
