"use client";
import { nextLabel, openState } from "@/lib/hours";
import { HoursPanel } from "@/components/AvailabilityPanel";
import { RestaurantPhotos } from "@/components/PhotoUpload";
import { geocode } from "@/lib/geo";
import { useState } from "react";
import { AllergenEditor } from "@/components/AllergenEditor";
import { ErrorNote, Field, inputCls, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { toast } from "@/components/Toaster";
import { act } from "@/lib/act";
import { sb, useAdminQuery, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";
import { actions, useStore } from "@/lib/store";
import { commissionRate } from "@/lib/pricing";

const blank = { name: "", cuisine: "", area: "", address: "", avg_prep_minutes: 15, commission_pct: "" as string | number, partner_since: "", min_order_cents: 0, active: true };
type RForm = typeof blank & { id?: string };

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

function RestaurantForm({ initial, onDone }: { initial: RForm; onDone: () => void }) {
  const [f, setF] = useState<RForm>(initial);
  const set = (k: keyof RForm, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) return toast("Name is required");
    const id = f.id;
    const payload = { name: f.name.trim(), cuisine: f.cuisine || null, area: f.area || null, address: f.address || null,
      avg_prep_minutes: Number(f.avg_prep_minutes), commission_pct: String(f.commission_pct ?? "").trim() === "" ? null : Number(String(f.commission_pct).replace(",", ".")), partner_since: f.partner_since || null, min_order_cents: Math.max(0, Math.round(Number(f.min_order_cents) || 0)), active: f.active } as Row;
    // Geocode real addresses (PDOK) so riders see drop-off distances; example addresses keep their area pin.
    if (f.address && !/^example/i.test(f.address)) {
      const p = await geocode(f.address).catch(() => null);
      if (p) { payload.lat = p.lat; payload.lng = p.lng; } else toast("Address not found by PDOK; distance will be unknown");
    }
    const ok = await act(id ? must(sb().from("restaurants").update(payload).eq("id", id)) : must(sb().from("restaurants").insert(payload)), id ? "Restaurant saved" : "Restaurant added");
    if (ok !== undefined) { actions.reloadCatalog(); onDone(); }
  }
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Cuisine"><input className={inputCls} value={f.cuisine ?? ""} onChange={(e) => set("cuisine", e.target.value)} /></Field>
      <Field label="Area"><input className={inputCls} value={f.area ?? ""} onChange={(e) => set("area", e.target.value)} /></Field>
      <Field label="Address"><input className={inputCls} value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
      <Field label="Avg prep (min)"><input type="number" min={5} max={120} className={inputCls} value={f.avg_prep_minutes} onChange={(e) => set("avg_prep_minutes", e.target.value)} /></Field>
      <Field label="Minimum order (€, food only; enforced at payment)"><input data-testid="min-order-input" type="number" min={0} max={100} step={0.5} className={inputCls} value={Number(f.min_order_cents) / 100} onChange={(e) => set("min_order_cents", Math.round(Number(e.target.value) * 100))} /></Field>
      <Field label="Custom delivered commission % (blank = plan rates: 20% for the first months, then 25%; pickup always uses the pickup rate)"><input data-testid="commission-override" inputMode="decimal" placeholder="plan rates" className={inputCls} value={f.commission_pct ?? ""} onChange={(e) => set("commission_pct", e.target.value)} /></Field>
      <Field label="Partner since (start of the founding-rate period; blank = first signature of the partner agreement)"><input data-testid="partner-since" type="date" className={inputCls} value={f.partner_since ?? ""} onChange={(e) => set("partner_since", e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Active (visible to customers)</label>
      <div className="flex gap-2 md:col-span-2 md:justify-end"><SmallBtn onClick={onDone}>Cancel</SmallBtn><SmallBtn tone="brand" onClick={save}>Save</SmallBtn></div>
    </div>
  );
}

function Menu({ restaurantId }: { restaurantId: string }) {
  const q = useAdminQuery<Row[]>(async () => sb().from("menu_items").select("*").eq("restaurant_id", restaurantId).order("name"), [restaurantId]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  async function add() {
    const cents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!name.trim() || !(cents > 0)) return toast("Name and price required");
    if (await act(must(sb().from("menu_items").insert({ restaurant_id: restaurantId, name: name.trim(), price_cents: cents })), "Item added") !== undefined) {
      setName(""); setPrice(""); q.reload(); actions.reloadCatalog();
    }
  }
  async function update(id: string, p: Row, msg: string) {
    if (await act(must(sb().from("menu_items").update(p).eq("id", id)), msg) !== undefined) { q.reload(); actions.reloadCatalog(); }
  }
  return (
    <div className="mt-3 rounded-xl bg-paper p-3">
      <ErrorNote error={q.error} />
      <div className="mb-2"><RestaurantPhotos restaurantId={restaurantId} english /></div>
      <Table head={["Item", "Price", "Allergens", "Available", ""]} empty={q.data?.length === 0}>
        {(q.data ?? []).map((m) => (
          <tr key={String(m.id)}>
            <Td>{String(m.name)}</Td>
            <Td>
              <input aria-label={`Price ${m.name}`} className={`${inputCls} w-24`} defaultValue={(Number(m.price_cents) / 100).toFixed(2)}
                onBlur={(e) => { const c = Math.round(Number(e.target.value.replace(",", ".")) * 100); if (c > 0 && c !== Number(m.price_cents)) void update(String(m.id), { price_cents: c }, `Price → ${eur(c)}`); }} />
            </Td>
            <Td><AllergenEditor itemId={String(m.id)} value={(m.allergens as string[]) ?? []} english />{m.allergens_test ? <div className="mt-1 text-[11px] italic text-muted">test values</div> : null}</Td>
            <Td><input type="checkbox" checked={Boolean(m.available)} onChange={(e) => update(String(m.id), { available: e.target.checked }, e.target.checked ? "Available" : "Marked unavailable")} /></Td>
            <Td className="text-right"><SmallBtn onClick={async () => { if (confirm(`Delete ${m.name}?`) && await act(must(sb().from("menu_items").delete().eq("id", String(m.id))), "Item deleted") !== undefined) { q.reload(); actions.reloadCatalog(); } }}>Delete</SmallBtn></Td>
          </tr>
        ))}
      </Table>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1`} placeholder="New item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={`${inputCls} w-28`} placeholder="€ price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <SmallBtn tone="dark" onClick={add}>+ Add item</SmallBtn>
      </div>
    </div>
  );
}

export default function RestaurantsAdmin() {
  const { settings } = useStore();
  const q = useAdminQuery<Row[]>(async () => sb().from("restaurants").select("*, menu_items(count)").order("name"), []);
  const [edit, setEdit] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const done = () => { setEdit(null); setAdding(false); q.reload(); };
  return (
    <Panel title="Restaurants" actions={<SmallBtn tone="brand" onClick={() => setAdding(true)}>+ Add restaurant</SmallBtn>}>
      <ErrorNote error={q.error} />
      {adding && <div className="mb-4 rounded-xl border border-line p-3"><RestaurantForm initial={blank} onDone={done} /></div>}
      {(q.data ?? []).map((r) => (
        <div key={String(r.id)} className="border-b border-line py-3 last:border-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b>{String(r.name)}</b> <StatusBadge s={r.active ? "active" : "suspended"} /> {(() => { const os = openState(r as never); return <span data-testid="admin-open" className={`ml-1 rounded px-1.5 text-[11px] font-semibold ${os.open ? "bg-[#e3f7ee] text-ok" : "bg-gold-soft text-warn"}`}>{os.open ? "Open now" : `${os.reason === "paused" ? "Paused" : os.reason === "holiday" ? "Holiday" : "Closed"} · ${nextLabel(os, true)}`}{Number(r.busy_extra_minutes ?? 0) > 0 ? ` · busy +${r.busy_extra_minutes} min` : ""}</span>; })()}
              <div className="text-xs text-muted">{String(r.cuisine ?? "")} · {String(r.area ?? "")} · <span data-testid="admin-commission">{commissionRate(settings, r as never)}% commission now{r.commission_pct != null ? " (custom)" : ""} · pickup {commissionRate(settings, r as never, true)}%{r.partner_since ? ` · partner since ${String(r.partner_since)}` : ""}</span> · min order €{(Number(r.min_order_cents ?? 0) / 100).toFixed(2)} · ~{String(r.avg_prep_minutes)} min prep · {String((r.menu_items as Row[])?.[0]?.count ?? 0)} items</div>
            </div>
            <div className="flex gap-2">
              <SmallBtn onClick={async () => { if (!confirm(r.active ? `Deactivate ${String(r.name)}? Customers will no longer see it or be able to order.` : `Activate ${String(r.name)}? It becomes visible to customers.`)) return; if (await act(must(sb().from("restaurants").update({ active: !r.active }).eq("id", String(r.id))), r.active ? "Deactivated" : "Activated") !== undefined) { q.reload(); actions.reloadCatalog(); } }}>{r.active ? "Deactivate" : "Activate"}</SmallBtn>
              <SmallBtn onClick={async () => { const paused = r.paused_until && new Date(String(r.paused_until)) > new Date(); if (await act(must(sb().rpc("restaurant_set_availability", { p_rid: String(r.id), p_pause_minutes: paused ? 0 : 60 })), paused ? "Resumed" : "Paused for 60 min") !== undefined) { q.reload(); actions.reloadCatalog(); } }}>{r.paused_until && new Date(String(r.paused_until)) > new Date() ? "Resume" : "Pause 60 min"}</SmallBtn>
              <SmallBtn onClick={() => setEdit(edit === r.id ? null : String(r.id))}>Edit</SmallBtn>
              <SmallBtn tone="dark" onClick={() => setMenu(menu === r.id ? null : String(r.id))}>{menu === r.id ? "Hide menu" : "Menu"}</SmallBtn>
            </div>
          </div>
          {edit === r.id && <div className="mt-3"><RestaurantForm initial={{ ...blank, ...(r as unknown as RForm), commission_pct: r.commission_pct == null ? "" : Number(r.commission_pct), partner_since: String(r.partner_since ?? "") }} onDone={done} /></div>}
          {menu === r.id && <><HoursPanel restaurantId={String(r.id)} english /><Menu restaurantId={String(r.id)} /></>}
        </div>
      ))}
      <p className="mt-2 text-xs text-muted">Restaurant staff accounts: set role “restaurant” and link the restaurant under Customers → account (or via SQL).</p>
    </Panel>
  );
}
