"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { act } from "@/lib/act";
import { useT, tx } from "@/lib/i18n";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import { Card, Header } from "@/components/ui";
import { restaurantStyle } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";

export function MenuView({ id }: { id: string }) {
  const { cart, restaurants, menuItems, ready, signedIn } = useStore();
  const router = useRouter();
  const t = useT();
  async function startGroup() {
    if (!signedIn) { router.push(`/login?next=${encodeURIComponent(`/r/${id}`)}`); return; }
    const res = await act((async () => {
      const { data, error } = await getSupabase()!.rpc("create_group_order", { p_restaurant: id });
      if (error) throw new Error(error.message);
      return data as { code: string };
    })());
    if (res?.code) router.push(`/group?code=${res.code}`);
  }
  const r = restaurants.find((x) => x.id === id);
  if (!r) return <><Header /><main id="main" className="p-4">{ready ? tx("Restaurant niet gevonden.", "Restaurant not found.") : tx("Laden…", "Loading…")}</main></>;
  const qty = cart.restaurant_id === id ? cart.qty : {};
  const items = menuItems.filter((m) => m.restaurant_id === id);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = items.reduce((a, m) => a + (qty[m.id] ?? 0) * m.price_cents, 0);
  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <Link href="/" className="text-sm text-muted">← {tx("Alle restaurants", "All restaurants")}</Link>
        <Card className="mt-2.5 flex items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl text-3xl" style={{ background: restaurantStyle(r.id).color }}>{restaurantStyle(r.id).emoji}</div>
          <div><h3 className="font-bold">{r.name}</h3><div className="text-[13px] text-muted">{r.cuisine} · ~{r.avg_prep_minutes} min prep</div>{r.address && <div className="text-[12px] text-muted">{r.address}</div>}{r.is_test && <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-800" data-testid="test-label">🧪 {r.description ?? "Test data, not a partner"} · example menu and prices · © OpenStreetMap contributors (ODbL)</div>}</div>
        </Card>
        {hasSupabase && (
          <button data-testid="start-group" onClick={startGroup} className="mb-3 flex w-full items-center justify-between rounded-2xl border-2 border-dashed border-brand bg-gold-soft px-4 py-3 text-left">
            <span><b className="text-brand">👥 {t("Groepsbestelling starten", "Start a group order")}</b><span className="block text-[12px] text-muted">{t("Deel een link, iedereen kiest zelf, één bezorging", "Share a link, everyone picks their own, one delivery")}</span></span>
            <span className="text-xl text-brand">→</span>
          </button>
        )}
        {items.map((m) => (
          <Card key={m.id} className="flex items-center justify-between">
            <div><b>{m.name}</b><div className="text-[13px] text-muted">{eur(m.price_cents)}</div></div>
            <div className="flex items-center gap-2.5">
              <button aria-label={tx("Eén minder", "Remove one")} className="h-8 w-8 rounded-full bg-[#f1ede8] font-bold" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) - 1)}>−</button>
              <b>{qty[m.id] ?? 0}</b>
              <button aria-label={tx("Eén meer", "Add one")} className="h-8 w-8 rounded-full bg-[#f1ede8] font-bold" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) + 1)}>+</button>
            </div>
          </Card>
        ))}
        {count > 0 && (
          <Link href="/cart" className="mt-2 block rounded-2xl bg-brand py-3.5 text-center font-bold text-white">
            {tx("Bekijk winkelmand", "View cart")} · {count} item{count > 1 ? "s" : ""} · {eur(total)}
          </Link>
        )}
      </main>
    </>
  );
}
