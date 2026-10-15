"use client";
import { useT, tx } from "@/lib/i18n";
import Link from "next/link";
import { Card, Empty, Header } from "@/components/ui";
import { ShoppingBag, X } from "lucide-react";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { Photo } from "@/components/Photo";

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
      <main id="main" className="p-4">
        <h1 className="mb-3 text-[28px]">{t("Je winkelmand", "Your cart")}</h1>
        {!r || lines.length === 0 ? <Empty icon={<ShoppingBag size={26} />}>{t("Je winkelmand is leeg.", "Your cart is empty.")} <Link className="text-brand" href="/">{t("Bekijk restaurants", "Browse restaurants")}</Link></Empty> : (
          <>
            <Card>
              <b>{r.name}</b>
              {lines.map(({ item, q }) => (
                <div key={item.id} className="mt-2 flex items-center justify-between">
                  <span className="flex min-w-0 items-center gap-2"><Photo src={item.image_url} alt={item.name} className="w-12 shrink-0 rounded-lg text-sm" sizes="48px" /><span>{q}× {item.name}</span></span>
                  <span className="flex items-center gap-2">{eur(q * item.price_cents)}
                    <button className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-subtle" aria-label={tx("Item verwijderen", "Remove item")} onClick={() => actions.setQty(r.id, item.id, 0)}><X size={16} /></button></span>
                </div>
              ))}
              <hr className="my-3 border-line" />
              <div className="flex justify-between text-sm text-muted"><span>{tx("Bezorgkosten (vast)", "Delivery fee (flat)")}</span><span>{eur(DELIVERY_FEE_CENTS)}</span></div>
              <div className="flex justify-between font-bold"><span>{tx("Totaal", "Total")}</span><span>{eur(sub + DELIVERY_FEE_CENTS)}</span></div>
            </Card>
            <Link href="/checkout" className="block min-h-12 rounded-xl bg-brand py-3.5 text-center font-semibold text-white">{tx("Naar afrekenen", "Go to checkout")}</Link>
          </>
        )}
      </main>
    </>
  );
}
