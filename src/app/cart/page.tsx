"use client";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { Card, Empty, Header } from "@/components/ui";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export default function CartPage() {
  const t = useT();
  const { cart, restaurants, menuItems } = useStore();
  const DELIVERY_FEE_CENTS = useStore().settings.delivery_fee_cents;
  const r = restaurants.find((x) => x.id === cart.restaurant_id);
  const lines = Object.entries(cart.qty).flatMap(([id, q]) => { const item = menuItems.find((m) => m.id === id); return item ? [{ item, q }] : []; });
  const sub = lines.reduce((a, l) => a + l.q * l.item.price_cents, 0);
  return (
    <>
      <Header />
      <main className="p-4">
        <h2 className="mb-3 text-lg font-bold">{t("Je winkelmand", "Your cart")}</h2>
        {!r || lines.length === 0 ? <Empty icon="🛒">{t("Je winkelmand is leeg.", "Your cart is empty.")} <Link className="text-brand" href="/">{t("Bekijk restaurants", "Browse restaurants")}</Link></Empty> : (
          <>
            <Card>
              <b>{r.name}</b>
              {lines.map(({ item, q }) => (
                <div key={item.id} className="mt-2 flex items-center justify-between">
                  <span>{q}× {item.name}</span>
                  <span className="flex items-center gap-2">{eur(q * item.price_cents)}
                    <button className="text-muted" aria-label="Remove item" onClick={() => actions.setQty(r.id, item.id, 0)}>✕</button></span>
                </div>
              ))}
              <hr className="my-3 border-dashed" />
              <div className="flex justify-between text-sm text-muted"><span>Delivery fee (flat)</span><span>{eur(DELIVERY_FEE_CENTS)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span>{eur(sub + DELIVERY_FEE_CENTS)}</span></div>
            </Card>
            <Link href="/checkout" className="block rounded-2xl bg-brand py-3.5 text-center font-bold text-white">Go to checkout</Link>
          </>
        )}
      </main>
    </>
  );
}
