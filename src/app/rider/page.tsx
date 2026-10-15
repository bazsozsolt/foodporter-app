"use client";
import { LeaveAtDoorNote, ProofCapture } from "@/components/DeliveryProof";
import { useT , tx } from "@/lib/i18n";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { AlertsToggle, TestSoundButton, useOrderAlerts } from "@/components/OrderAlerts";
import { distanceKm } from "@/lib/geo";
import { RoleGate } from "@/components/RoleGate";
import { useWakeLock } from "@/lib/wakeLock";
import { HelpButton } from "@/components/SupportSheet";
import { SosButton } from "@/components/SosButton";
import { act } from "@/lib/act";
import { Button, Card, Chips, Empty, Header, Pill, SectionHeader } from "@/components/ui";
import { restaurantStyle } from "@/lib/mock-data";
import { eur, hhmm } from "@/lib/format";
import { acceptedBid, actions, useStore } from "@/lib/store";
import { STATUS_LABEL, STATUS_LABEL_NL, type Order } from "@/lib/types";
import { mmss, useSecondsLeft } from "@/components/Countdown";
import { LiveMap, type MapMarker } from "@/components/LiveMap";
import { navUrl, osmNavUrl, useShareLocation } from "@/lib/location";
import { CallButton, OrderChat } from "@/components/OrderChat";
import { AlarmClock, Bike, ChefHat, ChevronRight, Hourglass, House, Inbox, MapPin, Navigation, Power, Timer, Wallet } from "lucide-react";

const riderBody = (n: number) => tx(`${n} ${n > 1 ? "bestellingen" : "bestelling"} in de buurt: bied nu je bezorgtijd`, `${n} order${n > 1 ? "s" : ""} open for bids near you`);

/** Server-side answer to "may I take this order?" (stacking rules); null = yes. */
function useCanBid(orderId: string, activeCount: number) {
  const [reason, setReason] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    void sb.rpc("can_bid", { p_order: Number(orderId) }).then(({ data }) => setReason((data as string | null) ?? null));
  }, [orderId, activeCount]);
  return reason;
}

function BidCard({ o, activeCount }: { o: Order; activeCount: number }) {
  const prep = o.prep_minutes ?? 15;
  const stackedExtra = activeCount > 0 ? 8 * activeCount : 0; // stacked: you deliver after your current stop(s)
  const opts = [prep + 8, prep + 12, prep + 18, prep + 25].map((m) => m + stackedExtra);
  const reason = useCanBid(o.id, activeCount);
  const t = useT();
  const [eta, setEta] = useState(opts[1]);
  const { restaurants, profile } = useStore();
  const mine = o.bids.find((b) => b.rider_id === profile?.id);
  const left = useSecondsLeft(o.bid_window_closes_at);
  const r = restaurants.find((x) => x.id === o.restaurant_id);
  return (
    <Card>
      <div className="flex items-center justify-between"><b className="text-[16px]">{r?.name}</b><Pill tone="ok">{eur(o.delivery_fee_cents)}</Pill></div>
      <div className="my-1.5 text-[13px] text-muted">{tx("Klaar over ~", "Ready in ~")}{prep} min{o.ready_at ? ` (~${hhmm(new Date(o.ready_at))})` : ""} · {o.address}</div>
      {r?.lat && o.lat ? <div data-testid="dropoff" className="flex items-center gap-1.5 text-[13px] font-semibold"><Bike size={14} aria-hidden />{distanceKm({ lat: r.lat, lng: r.lng! }, { lat: o.lat, lng: o.lng! }).toFixed(1)} km {tx("naar de klant vanaf", "drop-off from")} {r.area}</div> : null}
      {o.renotified_at && <div className="mt-1 text-[13px] font-semibold text-brand"><AlarmClock size={14} className="mr-1 inline" aria-hidden />{tx("Wacht nog op een rider — bied nu", "Still waiting for a rider — bid now")}</div>}
      {left != null && <p data-testid="auction" className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold"><Timer size={14} aria-hidden />{tx("Bieden sluit over", "Bidding closes in")} {mmss(left)}{left === 0 ? tx(" · winnaar wordt gekozen…", " · choosing the winner…") : ""}</p>}
      {activeCount > 0 && !mine && (reason === null
        ? <p data-testid="stack-ok" className="mt-2 rounded-xl bg-emerald-50 p-2 text-[13px] font-semibold text-emerald-800">{tx(`Op je route: combineer met je huidige rit. Bied de tijd tot deze klant zijn eten heeft (na je andere stop${activeCount > 1 ? "s" : ""}).`, `On your route: stack it with your current job. Bid the time until this customer gets their food (after your other stop${activeCount > 1 ? "s" : ""}).`)}</p>
        : reason ? <p data-testid="stack-no" className="mt-2 rounded-xl bg-subtle p-2 text-[13px] text-muted">{tx("Combineren kan niet", "Can't stack")}: {reason}</p> : null)}
      {mine ? (
        <p data-testid="my-bid" className="mt-3 rounded-xl bg-brand-soft p-3 text-sm">{tx("Jouw bod", "Your bid")}: <b>{mine.eta_minutes} min</b>. {tx("Laagste tijd wint als het venster sluit (gelijk: vroegste bod).", "Lowest ETA wins when the window closes (ties: earliest bid).")}</p>
      ) : left === 0 || (activeCount > 0 && reason !== null) ? null : (<>
        <p className="mb-2 mt-3 font-bold">{t("Bied je bezorgtijd", "Bid your delivery time")}</p>
        <Chips options={opts} value={eta} onChange={setEta} render={(m) => `${m} min`} />
        <p className="mt-2 text-[13px] text-muted">{o.bid_window_closes_at ? tx("Bieden is open", "Bidding is open") : tx("Eerste bod opent een venster van 60 s", "First bid opens a 60 s window")} · {tx("laagste tijd wint, bij gelijkspel het vroegste bod · je houdt de volledige vergoeding", "lowest ETA wins, ties go to the earliest bid · you keep the full fee")}</p>
        <Button onClick={() => act(actions.placeBid(o.id, eta), t(`Bod geplaatst: ${eta} min. De winnaar wordt gekozen als de biedtijd sluit.`, `Bid placed: ${eta} min. Winner is picked when the window closes.`))}>{t("Bod plaatsen", "Place bid")}</Button>
      </>)}
    </Card>
  );
}

export default function RiderPage() {
  const t = useT();
  const SL = t("nl", "en") === "nl" ? STATUS_LABEL_NL : STATUS_LABEL;
  const { orders, profile, mode, restaurants, earnings } = useStore();
  const open = orders.filter((o) => o.status === "accepted" && !acceptedBid(o));
  useOrderAlerts(open.map((o) => `${o.id}:${o.renotified_at ?? ""}`), tx("Beep-beep! Nieuwe bestelling om op te bieden", "Beep-beep! New order to bid on"), riderBody, "/rider/");
  const [name, setName] = useState<string | null>(null);
  const job = mode === "supabase" ? orders.find((o) => ["assigned", "ready", "picked_up"].includes(o.status) && o.rider_id === profile?.id) : undefined;
  const online = Boolean(profile?.online);
  const wake = useWakeLock(online || Boolean(job));
  const { me, error: gpsError } = useShareLocation(profile?.id, mode === "supabase" && profile?.role === "rider" && Boolean(profile?.location_consent_at) && (online || Boolean(job)), job?.id ?? null);
  async function toggleOnline() {
    if (!online && !profile?.location_consent_at) {
      const ok = confirm(tx("Je locatie delen zolang je online bent of een bezorging doet?\n\n• Admins zien je positie zolang je online bent.\n• De klant en het restaurant van je huidige bestelling zien die alleen tijdens die bezorging.\n• Delen stopt als je offline gaat en de bezorging klaar is. Punten worden na 7 dagen verwijderd.", "Share your location while you're online or on a delivery?\n\n• Admins see your position while you're online.\n• The customer and restaurant of your current order see it during that delivery only.\n• Sharing stops when you go offline and the delivery is done. Points are deleted after 7 days."));
      if (!ok) return;
      await act(actions.setOnline(true, true), tx("Je bent online · locatie wordt gedeeld", "You're online · sharing location"));
      return;
    }
    await act(actions.setOnline(!online), online ? tx("Je bent offline · locatie delen gestopt", "You're offline · location sharing stopped") : tx("Je bent online · locatie wordt gedeeld", "You're online · sharing location"));
  }
  const active = orders.filter((o) => ["assigned", "ready", "picked_up"].includes(o.status) && (mode === "mock" || profile?.role === "admin" || (o.rider_id ?? acceptedBid(o)?.rider_id) === profile?.id));
  const stops = useMyStops(mode === "supabase" ? active.map((o) => `${o.id}:${o.status}`).join(",") : "");
  return (
    <>
      <Header subtitle={t("Rider-app · Tilburg Centrum", "Rider app · Tilburg Centrum")} />
      <main id="main" className="p-4">
        <RoleGate role="rider">
        {mode === "supabase" && profile && (
          <button data-testid="online-toggle" onClick={toggleOnline} aria-pressed={online}
            className={`mb-3 flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 text-left text-white shadow-[var(--shadow-card)] ${online ? "bg-ok" : "bg-ink"}`}>
            <span className={`grid h-10 w-10 place-items-center rounded-full ${online ? "bg-white/20" : "bg-white/10"}`}><Power size={20} aria-hidden /></span>
            <span className="flex-1"><b className="block text-[17px]">{online ? tx("Je bent online", "You're online") : tx("Je bent offline", "You're offline")}</b>
              <span className="text-[13px] text-white/80">{online ? tx("Tik om offline te gaan", "Tap to go offline") : tx("Tik om online te gaan en opdrachten te krijgen", "Tap to go online and get jobs")}</span></span>
          </button>
        )}
        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2"><AlertsToggle /><TestSoundButton /></div>
        {mode === "supabase" && profile && (
          <details className="mb-3 rounded-2xl bg-white px-4 py-1 shadow-[var(--shadow-card)] ring-1 ring-black/[.04]">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">{tx("Jouw naam", "Your name")}: <span className="ml-1 font-normal text-muted">{profile.full_name || tx("nog niet ingesteld", "not set yet")}</span></summary>
            <div className="mb-3 flex gap-2">
            <input aria-label={tx("Jouw naam", "Your name")} className="flex-1 rounded-xl border border-line p-2.5 text-sm" placeholder={tx("Je voornaam (zichtbaar voor klanten)", "Your first name (shown to customers)")}
              value={name ?? profile.full_name ?? ""} onChange={(e) => setName(e.target.value)} />
            {name !== null && name !== (profile.full_name ?? "") && <button className="rounded-xl bg-ink px-3 text-sm font-bold text-white" onClick={async () => { if (await act(actions.setMyName(name), tx("Naam opgeslagen", "Name saved")) !== undefined) setName(null); }}>{tx("Opslaan", "Save")}</button>}
            </div>
          </details>
        )}
        {(online || job) && <p data-testid="gps" className="-mt-1 mb-1 text-xs text-muted">{gpsError ? gpsError : me ? tx(`Locatie wordt gedeeld (${me.lat.toFixed(4)}, ${me.lng.toFixed(4)}), elke ~7 s`, `Sharing location (${me.lat.toFixed(4)}, ${me.lng.toFixed(4)}) every ~7 s`) : tx("Wachten op GPS…", "Waiting for GPS…")}</p>}
        {(online || job) && <SosButton lat={me?.lat} lng={me?.lng} orderId={job?.id ?? null} />}
        {(online || job) && wake !== "unsupported" && <p data-testid="wake-lock" data-state={wake} className="mb-3 text-xs text-muted">{wake === "on" ? tx("Scherm blijft aan zolang je online bent", "Screen stays on while you're online") : tx("Scherm kan uitgaan: houd de app open voor meldingen", "Screen may turn off: keep the app open for alerts")}</p>}
        {stops.length > 0 && (
          <Card data-testid="route">
            <div className="flex items-center justify-between"><b>{t("Jouw route", "Your route")}{active.length > 1 ? t(` · ${active.length} bestellingen gecombineerd`, ` · ${active.length} orders stacked`) : ""}</b><Pill>{stops.length} stop{stops.length > 1 ? "s" : ""}</Pill></div>
            <div className="mt-2"><LiveMap height={240} markers={[
              ...stops.filter((x) => x.lat != null).map((x) => ({ id: `${x.kind}-${x.order_id}`, lat: x.lat!, lng: x.lng!, kind: x.kind === "pickup" ? "restaurant" as const : "dropoff" as const, label: `${x.seq}. ${x.kind === "pickup" ? "Pickup" : "Drop-off"} #${x.order_id}: ${x.label}` })),
              ...(me ? [{ id: "me", ...me, kind: "me" as const, label: tx("Jij", "You") }] : []),
            ]} /></div>
            <ol className="mt-2 space-y-1.5" data-testid="stop-list">
              {stops.map((x, i) => (
                <li key={`${x.kind}-${x.order_id}`} className={`flex items-center gap-2 rounded-xl p-2 text-sm ${i === 0 ? "bg-brand-soft" : "bg-white"}`}>
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{x.seq}</span>
                  <span className="min-w-0 flex-1"><b>{x.kind === "pickup" ? tx("Ophalen", "Pickup") : tx("Afleveren", "Drop-off")}</b> #{x.order_id} · <span className="text-muted">{x.label}</span></span>
                  {x.lat != null && <a data-testid="stop-nav" className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-[#1a73e8] px-3 text-xs font-semibold text-white" href={navUrl({ lat: x.lat, lng: x.lng! }, i === 0 ? me : stops[i - 1].lat != null ? { lat: stops[i - 1].lat!, lng: stops[i - 1].lng! } : null)} target="_blank" rel="noreferrer"><Navigation size={13} aria-hidden />{tx("Ga", "Go")}</a>}
                </li>
              ))}
            </ol>
          </Card>
        )}
        {active.map((o) => {
          const bid = acceptedBid(o); // null when an admin assigned the rider manually
          const rest = restaurants.find((x) => x.id === o.restaurant_id);
          const pickup = rest?.lat ? { lat: rest.lat, lng: rest.lng! } : null;
          const drop = o.lat ? { lat: o.lat, lng: o.lng! } : null;
          const target = o.status === "picked_up" ? drop : pickup;
          const markers: MapMarker[] = [
            ...(pickup ? [{ id: "r", ...pickup, kind: "restaurant" as const, label: `${tx("Ophalen", "Pickup")}: ${rest?.name}` }] : []),
            ...(drop ? [{ id: "d", ...drop, kind: "dropoff" as const, label: `${tx("Afleveren", "Drop-off")}: ${o.address}` }] : []),
            ...(me ? [{ id: "me", ...me, kind: "me" as const, label: tx("Jij", "You") }] : []),
          ];
          return (
            <Card key={o.id}>
              <div className="flex items-center justify-between"><span className="t-label">{t("Huidige opdracht", "Current job")} · #{o.id}</span><Pill>{SL[o.status]}</Pill></div>
              <ol className="mt-3 space-y-2" data-testid="job-steps">
                <li className={`flex items-start gap-3 rounded-xl p-2.5 ${o.status !== "picked_up" ? "bg-brand-soft" : "opacity-60"}`}><ChefHat size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden /><span><b className="block">1. {tx("Ophalen", "Pickup")}: {rest?.name}</b><span className="text-[13px] text-muted">{tx("Eten klaar", "Food ready")} ~{o.ready_at ? hhmm(new Date(o.ready_at)) : "?"}</span></span></li>
                <li className={`flex items-start gap-3 rounded-xl p-2.5 ${o.status === "picked_up" ? "bg-brand-soft" : ""}`}><House size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden /><span><b className="block">2. {tx("Afleveren", "Drop-off")}</b><span className="text-[13px] text-muted">{o.address}</span></span></li>
              </ol>
              <p className="mt-1 text-[13px] text-muted">{tx("Jouw tijd", "Your ETA")} {bid?.eta_minutes != null ? `${bid.eta_minutes} min` : tx("handmatig toegewezen", "assigned by ops")} · {tx("eten klaar", "food ready")} ~{o.ready_at ? hhmm(new Date(o.ready_at)) : "?"} ({o.prep_minutes} min {tx("bereiding", "prep")}) · {tx("naar", "to")} {o.address}</p>
              {markers.length > 0 && active.length === 1 && <div className="mt-2"><LiveMap markers={markers} /></div>}
              {target && <div className="mt-2 flex gap-2 text-sm font-semibold">
                <a data-testid="nav-link" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] text-center text-white" href={navUrl(target, me)} target="_blank" rel="noreferrer"><Navigation size={16} aria-hidden />{o.status === "picked_up" ? tx("Navigeer naar de klant", "Navigate to drop-off") : tx("Navigeer naar het restaurant", "Navigate to pickup")}</a>
                <a className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-center" href={osmNavUrl(target, me)} target="_blank" rel="noreferrer">OSM</a>
              </div>}
              {o.status === "assigned" && <Empty icon={<Hourglass size={24} />}>{t("Wachten tot het restaurant de bestelling klaar meldt…", "Waiting for the restaurant to mark ready…")}</Empty>}
              {o.status === "ready" && <Button className="min-h-14 text-[17px]" onClick={() => act(actions.pickUp(o.id), t("Klant geïnformeerd: je eten is onderweg", "Customer notified: your food is on the way"))}>{t("Opgehaald", "Picked up")}</Button>}
              <div className="mt-3 flex gap-2"><CallButton orderId={Number(o.id)} status={o.status} side="rider" asAdmin={o.rider_id !== profile?.id} /><HelpButton role="rider" orderId={Number(o.id)} label={tx("Probleem melden", "Report a problem")} /></div>
              <div className="mt-2"><OrderChat orderId={Number(o.id)} channel="rider" side={o.rider_id === profile?.id ? "rider" : "admin"} order={o} /></div>
              {o.leave_at_door && <LeaveAtDoorNote />}
              {o.status === "picked_up" && o.rider_id === profile?.id && <ProofCapture orderId={o.id} hasPhoto={!!o.delivery_photo_path} />}
              {o.status === "picked_up" && <Button variant="ok" disabled={o.leave_at_door && !o.delivery_photo_path && o.rider_id === profile?.id} className="min-h-14 text-[17px]" onClick={() => act(actions.deliver(o.id), tx(`Bezorgd · ${eur(o.delivery_fee_cents + (o.tip_cents ?? 0))} bij je verdiensten`, `Delivered · ${eur(o.delivery_fee_cents + (o.tip_cents ?? 0))} added to earnings`))}>{t("Bezorgd", "Delivered")}</Button>}
            </Card>
          );
        })}
        <SectionHeader action={<span className="text-xs text-muted">{open.length}</span>}>{t("Open opdrachten", "Open jobs")}</SectionHeader>
        {open.length === 0 ? <Empty icon={<Inbox size={24} />}>{t("Op dit moment geen bestellingen om op te bieden.", "No orders to bid on right now.")}</Empty> : open.map((o) => <BidCard key={o.id} o={o} activeCount={active.length} />)}
        <Link href="/rider/earnings" data-testid="earnings-link" className="mt-4 flex min-h-16 items-center gap-3 rounded-2xl bg-white px-4 shadow-[var(--shadow-card)] ring-1 ring-black/[.04]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-soft text-warn"><Wallet size={20} aria-hidden /></span>
          <span className="flex-1"><b className="block">{tx("Jouw verdiensten", "Your earnings")}</b><span className="text-[13px] text-muted">{tx("Nog uit te betalen", "Still to be paid")}: {eur(earnings.filter((e) => !e.payout_id).reduce((a, e) => a + e.amount_cents, 0))}</span></span>
          <ChevronRight size={18} className="text-muted" aria-hidden />
        </Link>
        <Link href="/rider-info" data-testid="rider-info-link" className="mt-3 block text-center text-sm font-semibold text-brand">{tx("Zo werken bieden, toewijzen en beoordeling", "How bidding, assignment and review work")}</Link>
        </RoleGate>
      </main>
    </>
  );
}

interface Stop { seq: number; kind: "pickup" | "dropoff"; order_id: number; label: string; lat: number | null; lng: number | null }
/** Ordered stops from the server: pickups first, then drop-offs nearest-first. Refreshes when jobs change. */
function useMyStops(key: string) {
  const [stops, setStops] = useState<Stop[]>([]);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !key) return;
    let alive = true;
    void sb.rpc("my_stops").then(({ data }) => { if (alive) setStops((data as Stop[]) ?? []); });
    return () => { alive = false; };
  }, [key]);
  return key ? stops : [];
}
