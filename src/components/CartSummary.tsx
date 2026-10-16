"use client";
import { tx } from "@/lib/i18n";
import Link from "next/link";
import { Card } from "@/components/ui";
import { X } from "lucide-react";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { Photo } from "@/components/Photo";
import { AllergenInfo } from "@/components/AllergenInfo";

/** Cart lines + total + the one primary "checkout" action. Used by /cart and the menu's bottom sheet. */
export function useCartLines() {
  const { cart, restaurants, menuItems, settings } = useStore();
  const r = restaurants.find((x) => x.id === cart.restaurant_id);
  const lines = Object.entries(cart.qty).flatMap(([id, q]) => { const item = menuItems.find((m) => m.id === id); return item && q > 0 ? [{ item, q }] : []; });
  const sub = lines.reduce((a, l) => a + l.q * l.item.price_cents, 0);
  return { r, lines, sub, fee: settings.delivery_fee_cents };
}

export function CartSummary() {
  const { r, lines, sub, fee } = useCartLines();
  if (!r || lines.length === 0) return null;
  return (
    <>
      <Card>
        <b>{r.name}</b>
        {lines.map(({ item, q }) => (
          <div key={item.id} className="mt-2 flex items-center justify-between">
            <span className="flex min-w-0 items-center gap-2"><Photo src={item.image_url} alt={item.name} className="w-12 shrink-0 rounded-lg text-sm" sizes="48px" /><span>{q}× {item.name}<AllergenInfo allergens={item.allergens} test={item.allergens_test} /></span></span>
            <span className="flex items-center gap-1">{eur(q * item.price_cents)}
              <button className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-subtle" aria-label={tx("Item verwijderen", "Remove item")} onClick={() => actions.setQty(r.id, item.id, 0)}><X size={16} /></button></span>
          </div>
        ))}
        <hr className="my-3 border-line" />
        <div className="flex justify-between text-sm text-muted"><span>{tx("Bezorgkosten (vast)", "Delivery fee (flat)")}</span><span>{eur(fee)}</span></div>
        <div className="flex justify-between font-bold"><span>{tx("Totaal", "Total")}</span><span>{eur(sub + fee)}</span></div>
      </Card>
      <Link href="/checkout" data-testid="go-checkout" className="block min-h-12 rounded-xl bg-brand py-3.5 text-center font-semibold text-white">{tx("Naar afrekenen", "Go to checkout")}</Link>
    </>
  );
}
