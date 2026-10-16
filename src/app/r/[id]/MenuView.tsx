"use client";
import { cuisineLabel } from "@/lib/format";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { act } from "@/lib/act";
import { useT, tx } from "@/lib/i18n";
import { getSupabase, hasSupabase } from "@/lib/supabase";
import { Badge, Card, Header, SectionHeader } from "@/components/ui";
import { ArrowLeft, ChevronRight, Clock, Minus, Plus, ShoppingBag, Users } from "lucide-react";
import { restaurantStyle } from "@/lib/mock-data";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { Photo } from "@/components/Photo";
import { PhotoCredits } from "@/components/PhotoCredits";
import { AllergenInfo } from "@/components/AllergenInfo";
import { HelpButton } from "@/components/SupportSheet";
import { ALLERGENS } from "@/lib/allergens";
import { useState } from "react";
import { DAYS_EN, DAYS_NL, nextLabel, openState, type Hours } from "@/lib/hours";
import { useLang } from "@/lib/i18n";

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
  const [avoid, setAvoid] = useState<string[]>([]);
  const en = useLang() === "en";
  const r = restaurants.find((x) => x.id === id);
  if (!r) return <><Header /><main id="main" className="p-4">{ready ? tx("Restaurant niet gevonden.", "Restaurant not found.") : tx("Laden…", "Loading…")}</main></>;
  const os = openState(r);
  const qty = cart.restaurant_id === id ? cart.qty : {};
  const all = menuItems.filter((m) => m.restaurant_id === id);
  const items = all.filter((m) => !avoid.some((a) => (m.allergens ?? []).includes(a)));
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const total = items.reduce((a, m) => a + (qty[m.id] ?? 0) * m.price_cents, 0);
  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <Link href="/" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-muted"><ArrowLeft size={16} aria-hidden />{tx("Alle restaurants", "All restaurants")}</Link>
        <Photo src={r.image_url} alt={r.name} emoji={restaurantStyle(r.id).emoji} ratio="16/7" eager className="mt-2.5 rounded-2xl text-3xl" sizes="(max-width: 640px) 100vw, 640px" />
        <Card className="mt-2.5 flex items-center gap-3">
          {r.logo_url && <Photo src={r.logo_url} alt={`${r.name} logo`} ratio="1/1" className="w-14 shrink-0 rounded-full" sizes="56px" />}
          <div className="min-w-0"><h1 className="text-[28px] leading-none">{r.name}</h1><div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">{cuisineLabel(r.cuisine)} <Badge><Clock size={12} aria-hidden />~{r.avg_prep_minutes + (r.busy_extra_minutes ?? 0)} {tx("min bereiding", "min prep")}</Badge>{(r.busy_extra_minutes ?? 0) > 0 && <Badge tone="warn">{tx(`Druk · +${r.busy_extra_minutes} min`, `Busy · +${r.busy_extra_minutes} min`)}</Badge>}</div>{r.address && <div className="mt-0.5 text-[12px] text-muted">{r.address}</div>}{r.is_test && <div className="mt-1 text-[12px] text-muted" data-testid="test-label">🧪 {tx("Testrestaurant (geen partner) · voorbeeldmenu en -prijzen", "Test restaurant (not a partner) · example menu and prices")}</div>}</div>
        </Card>
        {!os.open && (
          <div data-testid="closed-banner" role="status" className="mb-3 rounded-2xl bg-gold-soft p-3 text-[14px] text-warn">
            <b className="block">{os.reason === "paused" ? tx("Dit restaurant neemt even geen bestellingen aan", "This restaurant has paused orders") : os.reason === "holiday" ? tx("Vandaag gesloten", "Closed today") : tx("Nu gesloten", "Closed now")} · {nextLabel(os, en)}</b>
            {tx("Later bestellen kan: kies je gerechten en plan bij het afrekenen een tijd waarop we open zijn.", "You can order for later: pick your dishes and choose a time when we're open at checkout.")}
          </div>
        )}
        {r.opening_hours && (
          <details className="mb-3 rounded-2xl bg-white px-4 py-1 shadow-[var(--shadow-card)] ring-1 ring-black/[.04]" data-testid="opening-hours">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold"><Clock size={14} className="mr-1.5" aria-hidden />{tx("Openingstijden", "Opening hours")}</summary>
            <ul className="mb-2 text-[13px]">{DAYS_NL.map((_, i) => { const sl = (r.opening_hours as Hours)[String(i + 1)] ?? []; return <li key={i} className="flex justify-between py-0.5"><span>{en ? DAYS_EN[i] : DAYS_NL[i]}</span><span>{sl.length ? sl.map(([a, b]) => `${a}–${b}`).join(", ") : tx("gesloten", "closed")}</span></li>; })}</ul>
          </details>
        )}
        {hasSupabase && os.open && (
          <button data-testid="start-group" onClick={startGroup} className="mb-3 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left shadow-[var(--shadow-card)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Users size={20} aria-hidden /></span>
            <span className="flex-1"><b>{t("Groepsbestelling starten", "Start a group order")}</b><span className="block text-[12px] text-muted">{t("Deel een link, iedereen kiest zelf, één bezorging", "Share a link, everyone picks their own, one delivery")}</span></span>
            <ChevronRight size={18} className="text-muted" aria-hidden />
          </button>
        )}
        {(r.min_order_cents ?? 0) > 0 && <p data-testid="min-order" className="mb-2 text-[13px] text-muted">{tx(`Minimale bestelling ${eur(r.min_order_cents!)} (excl. bezorging)`, `Minimum order ${eur(r.min_order_cents!)} (excl. delivery)`)}</p>}
        <SectionHeader action={<HelpButton role="customer" label={tx("Vraag het restaurant", "Ask the restaurant")} />}>{tx("Menu", "Menu")}</SectionHeader>
        <details className="mb-3 rounded-2xl bg-white px-4 py-1 shadow-[var(--shadow-card)] ring-1 ring-black/[.04]" data-testid="allergen-filter">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{tx("Allergenen filteren", "Filter by allergen")}{avoid.length ? <span className="ml-2 rounded-full bg-ink px-2 text-xs text-white">{avoid.length}</span> : null}</summary>
          <p className="text-[12px] text-muted">{tx("Verberg gerechten met:", "Hide dishes containing:")}</p>
          <div className="my-2 flex flex-wrap gap-1.5">{ALLERGENS.map(([c, nl, en]) => <button key={c} aria-pressed={avoid.includes(c)} onClick={() => setAvoid(avoid.includes(c) ? avoid.filter((x) => x !== c) : [...avoid, c])} className={`min-h-9 rounded-full border px-3 text-[13px] font-semibold ${avoid.includes(c) ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{tx(nl, en)}</button>)}</div>
          <p className="mb-2 text-[12px] text-muted">{tx("Allergenen worden door het restaurant opgegeven. Twijfel je of heb je een ernstige allergie? Vraag het restaurant vóór je bestelt.", "Allergens are declared by the restaurant. In doubt or a severe allergy? Ask the restaurant before you order.")}</p>
        </details>
        {avoid.length > 0 && <p className="mb-2 text-[12px] text-muted" data-testid="allergen-hidden">{tx(`${all.length - items.length} gerecht(en) verborgen`, `${all.length - items.length} dish(es) hidden`)}</p>}
        {items.map((m) => (
          <Card key={m.id} className="flex items-center justify-between gap-3 !p-3">
            <Photo src={m.image_url} alt={m.name} emoji={restaurantStyle(r.id).emoji} className="w-20 shrink-0 rounded-xl text-lg" sizes="80px" />
            <div className="min-w-0 flex-1"><b className="block leading-snug">{m.name}</b><div className="mt-0.5 text-[14px] font-semibold text-ink/80">{eur(m.price_cents)}</div><AllergenInfo allergens={m.allergens} test={m.allergens_test} /></div>
            <div className="flex items-center gap-2.5">
              <button aria-label={tx("Eén minder", "Remove one")} disabled={!qty[m.id]} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-white disabled:opacity-30" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) - 1)}><Minus size={16} /></button>
              <b className="w-4 text-center">{qty[m.id] ?? 0}</b>
              <button aria-label={tx("Eén meer", "Add one")} className="grid h-10 w-10 place-items-center rounded-full bg-brand text-white disabled:opacity-30" onClick={() => actions.setQty(id, m.id, (qty[m.id] ?? 0) + 1)}><Plus size={16} /></button>
            </div>
          </Card>
        ))}
        <PhotoCredits credits={[r.image_credit, ...items.map((m) => m.image_credit)]} />
        {count > 0 && (
          <Link href="/cart" data-testid="view-cart" className="sticky bottom-20 z-30 mt-2 flex min-h-14 items-center gap-3 rounded-2xl bg-brand px-4 py-3 font-semibold text-white shadow-[var(--shadow-pop)]">
            <ShoppingBag size={20} aria-hidden /><span className="flex-1">{tx("Bekijk winkelmand", "View cart")} · {count} item{count > 1 ? "s" : ""}</span><span>{eur(total)}</span>
          </Link>
        )}
      </main>
    </>
  );
}
