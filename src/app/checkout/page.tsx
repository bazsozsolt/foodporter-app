"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, Chips, Empty, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";
import { actions, useStore, type Geo } from "@/lib/store";
import { AddressField } from "@/components/AddressField";
import { hasSupabase } from "@/lib/supabase";
import { orderHref } from "@/lib/orders";

export default function CheckoutPage() {
  const { cart, signedIn, menuItems, settings } = useStore();
  const [geo, setGeo] = useState<Geo | null>(null);
  const center = useMemo(() => ({ lat: settings.zone_center_lat, lng: settings.zone_center_lng }), [settings.zone_center_lat, settings.zone_center_lng]);
  const outOfZone = hasSupabase && (!geo || geo.distance_km > settings.zone_radius_km);
  const DELIVERY_FEE_CENTS = useStore().settings.delivery_fee_cents;
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [address, setAddress] = useState("Heuvelstraat 12, 5038 AA Tilburg");
  const [phone, setPhone] = useState("+31 6 1234 5678");
  const [method, setMethod] = useState<"iDEAL" | "Card">("iDEAL");
  const sub = Object.entries(cart.qty).reduce((a, [id, q]) => a + q * (menuItems.find((m) => m.id === id)?.price_cents ?? 0), 0);
  const input = "mb-2.5 mt-1 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-3";

  if (sub === 0) return <><Header /><main className="p-4"><Empty icon="🛒">Nothing to check out. <Link className="text-brand" href="/">Browse</Link></Empty></main></>;

  async function pay() {
    if (!signedIn) { router.push("/login?next=/checkout"); return; }
    setBusy(true);
    const id = await act(actions.placeOrder(address, phone, geo), hasSupabase ? undefined : `Order placed · Mollie ${method} payment is mocked (no Supabase)`);
    if (!id) { setBusy(false); return; }
    if (!hasSupabase) { setBusy(false); router.push(orderHref(id)); return; }
    // Mollie hosted checkout (iDEAL / card are chosen there); amount is computed server-side.
    const checkoutUrl = await act(actions.startPayment(id));
    setBusy(false);
    if (checkoutUrl) window.location.href = checkoutUrl;
    else router.push(orderHref(id)); // order exists unpaid; tracking page offers "Pay now"
  }

  return (
    <>
      <Header />
      <main className="p-4">
        <Link href="/cart" className="text-sm text-muted">← Back to cart</Link>
        <h2 className="my-3 text-lg font-bold">Checkout</h2>
        <Card>
          <label className="text-[13px] text-muted">Delivery address</label>
          <AddressField value={address} onChange={setAddress} geo={geo} onGeo={setGeo} center={center} radiusKm={settings.zone_radius_km} />
          <label className="text-[13px] text-muted">Phone (for SMS updates)</label>
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Card>
        <Card>
          <div className="flex justify-between"><span>Subtotal</span><span>{eur(sub)}</span></div>
          <div className="flex justify-between text-sm text-muted"><span>Delivery fee (flat)</span><span>{eur(DELIVERY_FEE_CENTS)}</span></div>
          <div className="mt-1 flex justify-between font-bold"><span>Total</span><span>{eur(sub + DELIVERY_FEE_CENTS)}</span></div>
        </Card>
        <Card><b>Pay with Mollie</b><div className="mt-2"><Chips options={["iDEAL", "Card"] as const as ("iDEAL" | "Card")[]} value={method} onChange={setMethod} /></div></Card>
        <Button onClick={pay} disabled={busy || (Boolean(signedIn) && outOfZone)}>{busy ? "Redirecting to Mollie…" : signedIn ? `Pay ${eur(sub + DELIVERY_FEE_CENTS)} with ${method}` : "Sign in to pay"}</Button>
        <p className="mt-3 text-center text-xs text-muted">By paying you agree to our <Link className="underline" href="/terms">Terms</Link> and <Link className="underline" href="/privacy">Privacy policy</Link>. Cancelled orders are refunded in full.</p>
      </main>
    </>
  );
}
