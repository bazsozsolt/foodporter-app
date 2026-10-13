"use client";
import Link from "next/link";
import { Card, Header } from "@/components/ui";
import { menuItems, restaurants } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export function MenuView({ id }: { id: string }) {
  const { cart } = useStore();
  const r = restaurants.find((x) => x.id === id);
  if (!r) return <><Header /><main className="p-4">Restaurant not found.</main></>;
  const qty = cart.restaurant_id === id ? cart.qty : {};
  const items = menuItems.filter((m) => m.restaurant_id === id);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = items.reduce((a, m) => a + (qty[m.id] ?? 0) * m.price_cents, 0);
  return (
    <>
      <Header />
      <main className="p-4">
        <Link href="/" className="text-sm text-muted">← All restaurants</Link>
        <Card className="mt-2.5 flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl text-3xl" style={{ background: r.color }}>{r.emoji}</div>
          <div><h3 className="font-bold">{r.name}</h3><div className="text-[13px] text-muted">{r.cuisine} · ~{r.avg_prep_minutes} min prep</div></div>
        </Card>
        {items.map((m) => (
          <Card key={m.id} className="flex items-center justify-between">
            <div><b>{m.name}</b><div className="text-[13px] text-muted">{eur(m.price_cents)}</div></div>
            <div className="flex items-center gap-2.5">
              <button aria-label="Remove" className="h-8 w-8 rounded-full bg-[#f1ede8] font-bold" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) - 1)}>−</button>
              <b>{qty[m.id] ?? 0}</b>
              <button aria-label="Add" className="h-8 w-8 rounded-full bg-[#f1ede8] font-bold" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) + 1)}>+</button>
            </div>
          </Card>
        ))}
        {count > 0 && (
          <Link href="/cart" className="mt-2 block rounded-2xl bg-brand py-3.5 text-center font-bold text-white">
            View cart · {count} item{count > 1 ? "s" : ""} · {eur(total)}
          </Link>
        )}
      </main>
    </>
  );
}
