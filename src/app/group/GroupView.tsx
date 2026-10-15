"use client";
import { CircleCheck, Search, Share2, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Empty, Header, Pill } from "@/components/ui";
import { AddressField } from "@/components/AddressField";
import { TestModeCheckoutNote } from "@/components/TestModeBanner";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { toast } from "@/components/Toaster";
import { act } from "@/lib/act";
import { eur } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { orderHref } from "@/lib/orders";
import { actions, useStore, type Geo } from "@/lib/store";
import { getSupabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type Group = { id: string; code: string; host_id: string; restaurant_id: string; status: "open" | "locked" | "checked_out" | "cancelled"; deadline: string | null; order_id: number | null };
type Member = { user_id: string; display_name: string; joined_at: string };
type Item = { id: string; user_id: string; menu_item_id: string; name: string; qty: number; price_cents: number; added_at: string };
type Preview = { id: string; status: string; deadline: string | null; restaurant_id: string; restaurant_name: string; host_name: string; members: number };

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const sb = getSupabase(); if (!sb) throw new Error("Group orders need Supabase");
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Split: everyone pays their own food; the flat delivery fee is shared equally by people with items (host takes the rounding cents). */
export function splitShares(members: Member[], items: Item[], fee: number, hostId: string) {
  const food = new Map<string, number>();
  for (const i of items) food.set(i.user_id, (food.get(i.user_id) ?? 0) + i.qty * i.price_cents);
  const payers = members.filter((m) => food.get(m.user_id));
  const each = payers.length ? Math.floor(fee / payers.length) : 0;
  const rest = fee - each * payers.length;
  return payers.map((m) => {
    const f = food.get(m.user_id)!; const d = each + (m.user_id === hostId ? rest : 0);
    return { ...m, food: f, fee: d, total: f + d };
  });
}

export function GroupView() {
  const code = (useSearchParams().get("code") ?? "").toUpperCase();
  const t = useT();
  const router = useRouter();
  const { signedIn, profile, ready, menuItems, restaurants, settings } = useStore();
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [tip, setTip] = useState(0);
  const [door, setDoor] = useState(false);
  const [geo, setGeo] = useState<Geo | null>(null);
  const center = useMemo(() => ({ lat: settings.zone_center_lat, lng: settings.zone_center_lng }), [settings.zone_center_lat, settings.zone_center_lng]);

  const [myGroups, setMyGroups] = useState<(Group & { created_at: string; members: number; items: number })[] | null>(null);
  const loadMine = useCallback(async () => {
    const sb = getSupabase(); if (!sb || !profile) return;
    const { data } = await sb.from("group_members").select("group_orders(id, code, host_id, restaurant_id, status, deadline, order_id, created_at, group_members(count), group_items(count))")
      .eq("user_id", profile.id).order("joined_at", { ascending: false }).limit(20);
    setMyGroups(((data ?? []) as unknown as { group_orders: Record<string, unknown> }[]).map((r) => r.group_orders).filter(Boolean).map((g) => ({
      ...(g as unknown as Group & { created_at: string }),
      members: ((g.group_members as { count: number }[]) ?? [])[0]?.count ?? 0, items: ((g.group_items as { count: number }[]) ?? [])[0]?.count ?? 0,
    })));
  }, [profile]);
  useEffect(() => { if (code || !profile) return; const h = setTimeout(() => void loadMine(), 0); return () => clearTimeout(h); }, [code, profile, loadMine]);

  const load = useCallback(async () => {
    const sb = getSupabase(); if (!sb || !code) return;
    const pv = await sb.rpc("group_preview", { p_code: code });
    setPreview((pv.data as Preview) ?? null);
    const gid = (pv.data as Preview | null)?.id; if (!gid) return;
    const [g, m, i] = await Promise.all([
      sb.from("group_orders").select("id, code, host_id, restaurant_id, status, deadline, order_id").eq("id", gid).maybeSingle(),
      sb.from("group_members").select("user_id, display_name, joined_at").eq("group_id", gid).order("joined_at"),
      sb.from("group_items").select("id, user_id, menu_item_id, name, qty, price_cents, added_at").eq("group_id", gid).order("added_at"),
    ]);
    setGroup((g.data as Group) ?? null); setMembers((m.data as Member[]) ?? []); setItems((i.data as Item[]) ?? []);
  }, [code]);

  useEffect(() => { if (!signedIn) return; const h = setTimeout(() => void load(), 0); return () => clearTimeout(h); }, [signedIn, load]);

  // Live basket: every change bumps group_orders.updated_at (an RLS-filtered UPDATE event) -> refetch.
  const gid = group?.id;
  useEffect(() => {
    const sb = getSupabase(); if (!sb || !gid) return;
    const ch = sb.channel("group-" + gid)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "group_orders", filter: `id=eq.${gid}` }, () => void load())
      .subscribe();
    const poll = setInterval(() => void load(), 30000); // safety net if the socket drops
    return () => { void sb.removeChannel(ch); clearInterval(poll); };
  }, [gid, load]);

  const left = useSecondsLeft(group?.status === "open" ? group.deadline : null);
  const isHost = Boolean(group && profile && group.host_id === profile.id);
  const restaurant = restaurants.find((r) => r.id === (group?.restaurant_id ?? preview?.restaurant_id));
  const menu = menuItems.filter((m) => m.restaurant_id === group?.restaurant_id);
  const editable = group?.status === "open" && (left === null || left > 0);
  const subtotal = items.reduce((a, i) => a + i.qty * i.price_cents, 0);
  const fee = settings.delivery_fee_cents;
  const nameOf = (uid: string) => members.find((m) => m.user_id === uid)?.display_name ?? "?";
  const shares = group ? splitShares(members, items, fee, group.host_id) : [];
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}${BASE}/group/?code=${code}` : "";
  const input = "mt-1 w-full rounded-xl border border-line p-3";

  async function run<T>(p: Promise<T>, ok?: string) { setBusy(true); const v = await act(p, ok); setBusy(false); await load(); return v; }

  async function share() {
    const text = t(`Doe mee met mijn groepsbestelling bij ${restaurant?.name ?? "Food Porter"}: code ${code}`, `Join my group order at ${restaurant?.name ?? "Food Porter"}: code ${code}`);
    try {
      if (navigator.share) await navigator.share({ title: "Food Porter", text, url: shareUrl });
      else { await navigator.clipboard.writeText(`${text}\n${shareUrl}`); toast(t("Link gekopieerd", "Link copied")); }
    } catch { /* user cancelled */ }
  }

  async function checkout() {
    setBusy(true);
    const oid = await act(rpc<number>("group_checkout", { p_group: group!.id, p_address: address, p_phone: phone }));
    if (!oid) { setBusy(false); return; }
    const url = await act(actions.startPayment(String(oid), tip, { leave_at_door: door }));
    setBusy(false);
    if (url) window.location.href = url; else router.push(orderHref(oid));
  }

  // ---- no code: start / enter a code
  if (!code) return (
    <><Header subtitle={t("Groepsbestelling", "Group order")} />
      <main id="main" className="p-4">
        <h2 className="font-display mb-2 text-2xl">{t("Samen bestellen", "Order together")}</h2>
        <Card>
          <p className="text-sm text-muted">{t("Open een restaurant en tik op “Groepsbestelling starten”, of vul hieronder de code in die je hebt gekregen.", "Open a restaurant and tap “Start group order”, or enter the code you received below.")}</p>
          <input data-testid="group-code-input" className={input + " uppercase tracking-[0.3em]"} maxLength={6} placeholder="ABC234" aria-label={t("Groepscode", "Group code")} value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          <Button disabled={codeInput.length !== 6} onClick={() => router.push(`/group?code=${codeInput}`)}>{t("Meedoen", "Join")}</Button>
        </Card>
        {signedIn && (
          <section data-testid="my-groups">
            <h3 className="font-display mb-2 mt-4 text-xl">{t("Mijn groepen", "My groups")}</h3>
            {myGroups === null ? <p className="text-sm text-muted">{t("Laden…", "Loading…")}</p>
              : myGroups.length === 0 ? <Empty icon={<Users size={24} />}>{t("Je zit nog in geen enkele groep. Start er een vanuit een restaurant.", "You're not in any group yet. Start one from a restaurant.")}</Empty>
              : myGroups.map((g) => (
                <Link key={g.id} href={`/group?code=${g.code}`}>
                  <Card className="flex items-center justify-between">
                    <div><b>{restaurants.find((r) => r.id === g.restaurant_id)?.name ?? t("Restaurant", "Restaurant")}</b>
                      <div className="text-[12px] text-muted">{g.code} · {g.members} {t(g.members === 1 ? "persoon" : "personen", g.members === 1 ? "person" : "people")} · {g.items} item{g.items === 1 ? "" : "s"}{g.host_id === profile?.id ? " · host" : ""}</div></div>
                    <Pill tone={g.status === "open" ? "ok" : "brand"}>{({ open: t("OPEN", "OPEN"), locked: t("VERGRENDELD", "LOCKED"), checked_out: t("BESTELD", "ORDERED"), cancelled: t("GEANNULEERD", "CANCELLED") })[g.status]}</Pill>
                  </Card>
                </Link>))}
          </section>
        )}
        <Link href="/" className="mt-2 inline-block text-sm text-brand">← {t("Kies een restaurant", "Pick a restaurant")}</Link>
      </main></>
  );

  if (ready && !signedIn) return (
    <><Header subtitle={t("Groepsbestelling", "Group order")} />
      <main id="main" className="p-4"><Card>
        <h2 className="font-display text-2xl">{t("Je bent uitgenodigd", "You're invited")}</h2>
        <p className="my-2 text-sm text-muted">{t("Log in om mee te doen met groepsbestelling", "Sign in to join group order")} <b className="tracking-widest text-ink">{code}</b>.</p>
        <Button onClick={() => router.push(`/login?next=${encodeURIComponent(`/group?code=${code}`)}`)}>{t("Inloggen om mee te doen", "Sign in to join")}</Button>
      </Card></main></>
  );

  if (preview === undefined) return <><Header /><p className="p-6 text-center text-muted">{t("Laden…", "Loading…")}</p></>;
  if (preview === null) return <><Header /><main id="main" className="p-4"><Empty icon={<Search size={24} />}>{t("Deze groepsbestelling bestaat niet.", "This group order doesn't exist.")} <Link className="text-brand" href="/group">{t("Andere code", "Try another code")}</Link></Empty></main></>;

  // ---- not a member yet: join screen
  if (!group) return (
    <><Header subtitle={t("Groepsbestelling", "Group order")} />
      <main id="main" className="p-4"><Card data-testid="group-join">
        <h2 className="font-display text-2xl">{preview.restaurant_name}</h2>
        <p className="mb-3 text-sm text-muted">{t(`${preview.host_name} nodigt je uit · ${preview.members} ${preview.members === 1 ? "persoon" : "personen"} doen al mee`, `${preview.host_name} invited you · ${preview.members} ${preview.members === 1 ? "person" : "people"} already in`)}</p>
        {preview.status === "open" ? <>
          <label className="text-[13px] text-muted">{t("Jouw naam (zichtbaar voor de groep)", "Your name (shown to the group)")}</label>
          <input data-testid="group-name" className={input} maxLength={40} placeholder={profile?.full_name?.split(" ")[0] ?? t("Voornaam", "First name")} value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={busy} onClick={() => run(rpc("join_group_order", { p_code: code, p_name: name || null }), t("Je doet mee!", "You're in!"))}>{t("Meedoen", "Join")}</Button>
        </> : <p className="font-semibold text-brand">{t("Deze groep is gesloten.", "This group is closed.")}</p>}
      </Card></main></>
  );

  // ---- member view
  const statusPill = group.status === "open" ? (left !== null && left <= 0 ? t("DEADLINE VOORBIJ", "DEADLINE PASSED") : t("OPEN", "OPEN"))
    : group.status === "locked" ? t("VERGRENDELD", "LOCKED") : group.status === "checked_out" ? t("BESTELD", "ORDERED") : t("GEANNULEERD", "CANCELLED");
  const mine = (mid: string) => items.find((i) => i.menu_item_id === mid && i.user_id === profile?.id);

  return (
    <><Header subtitle={t("Groepsbestelling", "Group order")} />
      <main id="main" className="p-4">
        <Card data-testid="group-header">
          <div className="flex items-start justify-between gap-2">
            <div><h2 className="font-display text-2xl leading-none">{restaurant?.name ?? preview.restaurant_name}</h2>
              <div className="mt-1 text-[13px] text-muted">{t("Host", "Host")}: {nameOf(group.host_id)} · {members.length} {t(members.length === 1 ? "persoon" : "personen", members.length === 1 ? "person" : "people")}</div></div>
            <Pill tone={group.status === "open" ? "ok" : "brand"}>{statusPill}</Pill>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex-1 rounded-xl bg-gold-soft px-3 py-2 text-center"><div className="text-[11px] uppercase text-muted">{t("Code", "Code")}</div><b data-testid="group-code" className="text-xl tracking-[0.3em]">{group.code}</b></div>
            <button data-testid="group-share" onClick={share} className="min-h-12 rounded-xl bg-brand px-4 py-3 font-semibold text-white"><Share2 size={16} className="mr-1.5 inline" aria-hidden />{t("Delen", "Share")}</button>
          </div>
          {group.deadline && group.status === "open" && left !== null && <p className="mt-2 text-sm font-semibold" data-testid="group-deadline">⏱ {left > 0 ? t(`Nog ${mmss(left)} om toe te voegen`, `${mmss(left)} left to add items`) : t("De deadline is voorbij", "The deadline has passed")}</p>}
        </Card>

        {group.status === "checked_out" && group.order_id && (
          <Card className="bg-gold-soft"><b className="inline-flex items-center gap-1.5"><CircleCheck size={16} className="text-ok" aria-hidden />{t("Besteld en betaald door de host", "Ordered and paid by the host")}</b>
            {isHost && <Link className="mt-2 block font-bold text-brand" href={orderHref(group.order_id)}>{t("Volg bestelling", "Track order")} #{group.order_id} →</Link>}</Card>
        )}

        {editable && menu.length > 0 && (
          <Card>
            <b>{t("Voeg je eigen items toe", "Add your own items")}</b>
            {menu.map((m) => { const it = mine(m.id); return (
              <div key={m.id} className="flex items-center justify-between border-b border-[#f1ede8] py-2 last:border-0">
                <div><div className="font-semibold">{m.name}</div><div className="text-[13px] text-muted">{eur(m.price_cents)}</div></div>
                <div className="flex items-center gap-2.5">
                  {it && <button aria-label={t("Eén minder", "Remove one")} className="h-8 w-8 rounded-full bg-subtle font-bold" disabled={busy} onClick={() => run(rpc("group_set_qty", { p_item: it.id, p_qty: it.qty - 1 }))}>−</button>}
                  {it && <b>{it.qty}</b>}
                  <button aria-label={t(`${m.name} toevoegen`, `Add ${m.name}`)} data-testid="group-add" className="h-8 w-8 rounded-full bg-brand font-bold text-white" disabled={busy} onClick={() => run(rpc("group_add_item", { p_group: group.id, p_menu_item: m.id, p_qty: 1 }))}>+</button>
                </div>
              </div>); })}
          </Card>
        )}

        <Card data-testid="group-basket">
          <div className="flex items-center justify-between"><b>{t("Groepsmand", "Group basket")}</b><span className="text-[12px] text-ok">● {t("live", "live")}</span></div>
          {items.length === 0 && <p className="mt-2 text-sm text-muted">{t("Nog niets toegevoegd.", "Nothing added yet.")}</p>}
          {members.filter((m) => items.some((i) => i.user_id === m.user_id)).map((m) => (
            <div key={m.user_id} className="mt-3">
              <div className="text-[13px] font-bold text-brand">{m.display_name}{m.user_id === profile?.id ? ` (${t("jij", "you")})` : ""}{m.user_id === group.host_id ? " · host" : ""}</div>
              {items.filter((i) => i.user_id === m.user_id).map((i) => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span>{i.qty}× {i.name}</span>
                  <span className="flex items-center gap-2">{eur(i.qty * i.price_cents)}
                    {((isHost && ["open", "locked"].includes(group.status)) || (i.user_id === profile?.id && editable)) &&
                      <button aria-label={t(`${i.name} verwijderen`, `Remove ${i.name}`)} data-testid="group-remove" className="text-muted" onClick={() => run(rpc("group_remove_item", { p_item: i.id }))}><X size={16} /></button>}</span>
                </div>))}
            </div>))}
          <div className="mt-3 border-t border-[#f1ede8] pt-2 text-sm">
            <div className="flex justify-between"><span>{t("Subtotaal", "Subtotal")}</span><span>{eur(subtotal)}</span></div>
            <div className="flex justify-between text-muted"><span>{t("Bezorgkosten (één rit)", "Delivery fee (one trip)")}</span><span>{eur(fee)}</span></div>
            <div className="flex justify-between font-bold"><span>{t("Totaal", "Total")}</span><span>{eur(subtotal + fee)}</span></div>
          </div>
          {items.length > 0 && <button className="mt-2 text-sm font-semibold text-brand" data-testid="group-split-toggle" onClick={() => setShowSplit(!showSplit)}>{showSplit ? "▾" : "▸"} {t("Verdeling per persoon", "Split per person")}</button>}
          {showSplit && (
            <div className="mt-2 rounded-xl bg-[#faf8f5] p-3 text-sm" data-testid="group-split">
              {shares.map((s) => <div key={s.user_id} className="flex justify-between"><span>{s.display_name}</span><span>{eur(s.food)} + {eur(s.fee)} = <b>{eur(s.total)}</b></span></div>)}
              <p className="mt-1 text-[12px] text-muted">{t("De host betaalt alles via Mollie; dit is wat iedereen de host terugbetaalt (bezorgkosten gelijk verdeeld).", "The host pays everything via Mollie; this is what everyone owes the host (delivery fee split equally).")}</p>
            </div>)}
        </Card>

        {isHost && ["open", "locked"].includes(group.status) && (
          <Card data-testid="group-host">
            <b>{t("Host-instellingen", "Host controls")}</b>
            {group.status === "open" && <>
              <p className="mt-2 text-[13px] text-muted">{t("Deadline", "Deadline")}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {[15, 30, 45, 60].map((m) => <button key={m} className="rounded-full bg-subtle px-3 py-1.5 text-sm font-semibold" onClick={() => run(rpc("group_set_deadline", { p_group: group.id, p_minutes: m }), t(`Deadline over ${m} min`, `Deadline in ${m} min`))}>{m} min</button>)}
                {group.deadline && <button className="rounded-full px-3 py-1.5 text-sm text-muted" onClick={() => run(rpc("group_set_deadline", { p_group: group.id, p_minutes: null }))}>{t("Geen", "None")}</button>}
              </div>
            </>}
            <Button variant={group.status === "open" ? "dark" : "ghost"} disabled={busy} onClick={() => run(rpc("group_set_locked", { p_group: group.id, p_locked: group.status === "open" }), group.status === "open" ? t("Mand vergrendeld", "Basket locked") : t("Mand weer open", "Basket reopened"))}>
              {group.status === "open" ? "" + t("Mand vergrendelen", "Lock basket") : t("Mand weer openen", "Reopen basket")}</Button>
            {group.status === "locked" && items.length > 0 && <>
              <p className="mt-4 font-bold">{t("Afrekenen (jij betaalt voor iedereen)", "Checkout (you pay for everyone)")}</p>
              <label className="text-[13px] text-muted">{t("Eén bezorgadres", "One delivery address")}</label>
              <AddressField value={address} onChange={setAddress} geo={geo} onGeo={setGeo} center={center} radiusKm={settings.zone_radius_km} />
              <label className="text-[13px] text-muted">{t("Telefoon (voor SMS-updates)", "Phone (for SMS updates)")}</label>
              <input data-testid="group-phone" className={input} type="tel" placeholder="06 12345678" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <label className="my-2 flex min-h-11 items-center gap-2 text-sm" data-testid="group-leave-at-door"><input type="checkbox" checked={door} onChange={(e) => setDoor(e.target.checked)} className="h-5 w-5" />{t("Zet het bij de deur (zonder contact, de rider maakt een foto)", "Leave at the door (contactless, the rider takes a photo)")}</label>
              <p className="text-[13px] text-muted">{t("Fooi voor je rider (100% voor de rider)", "Tip your rider (100% to the rider)")}</p>
              <div className="mb-2 flex flex-wrap gap-2" data-testid="group-tip-picker">
                {[0, 100, 200, 300].map((c) => (
                  <button key={c} type="button" data-testid={`group-tip-${c}`} aria-pressed={tip === c} onClick={() => setTip(c)}
                    className={`min-h-11 rounded-full px-4 text-sm font-semibold ring-1 ${tip === c ? "bg-ink text-white ring-ink" : "bg-white ring-line"}`}>{c === 0 ? t("Geen", "None") : eur(c)}</button>
                ))}
              </div>
              <TestModeCheckoutNote />
              <Button disabled={busy || !geo || geo.distance_km > settings.zone_radius_km || phone.replace(/\D/g, "").length < 9} onClick={checkout}>{busy ? t("Doorsturen naar Mollie…", "Redirecting to Mollie…") : t(`Betaal ${eur(subtotal + fee + (settings.service_fee_cents ?? 0) + tip)} met Mollie`, `Pay ${eur(subtotal + fee + (settings.service_fee_cents ?? 0) + tip)} with Mollie`)}</Button>
            </>}
            <button className="mt-3 w-full text-center text-sm text-muted underline" onClick={() => { if (confirm(t("Groepsbestelling annuleren?", "Cancel this group order?"))) void run(rpc("group_cancel", { p_group: group.id })); }}>{t("Groepsbestelling annuleren", "Cancel group order")}</button>
          </Card>
        )}
        {!isHost && group.status === "open" && <button className="w-full text-center text-sm text-muted underline" onClick={() => confirm(t("Groep verlaten? Je gerechten worden uit het mandje gehaald.", "Leave the group? Your dishes are removed from the basket.")) && run(rpc("group_leave", { p_group: group.id })).then(() => router.push("/"))}>{t("Groep verlaten", "Leave group")}</button>}
        {!isHost && group.status === "locked" && <p className="text-center text-sm text-muted">{t("De host rekent nu af.", "The host is checking out.")}</p>}
      </main></>
  );
}
