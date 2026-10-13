"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ErrorNote, Panel, StatusBadge, Table, Td } from "@/components/admin";
import { LiveMap, type MapMarker } from "@/components/LiveMap";
import { fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";

interface Pt { rider_id: string; order_id: number | null; lat: number; lng: number; created_at: string }

export default function AdminMap() {
  const q = useAdminQuery<{ pts: Pt[]; orders: Row[]; riders: Row[] }>(async () => {
    const c = sb();
    const since = new Date(Date.now() - 30 * 60000).toISOString();
    const [l, o, r] = await Promise.all([
      c.from("rider_locations").select("rider_id, order_id, lat, lng, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      c.from("orders").select("id, status, address, lat, lng, rider_id, restaurants(name, lat, lng)").in("status", ["placed", "accepted", "assigned", "ready", "picked_up"]),
      c.from("profiles").select("id, full_name, email, online").in("role", ["rider", "admin"]),
    ]);
    return { data: { pts: (l.data as Pt[]) ?? [], orders: o.data ?? [], riders: r.data ?? [] }, error: l.error ?? o.error ?? r.error };
  }, []);
  const [live, setLive] = useState<Record<string, Pt>>({});
  useEffect(() => {
    const c = sb();
    const ch = c.channel("admin-locs").on("postgres_changes", { event: "INSERT", schema: "public", table: "rider_locations" },
      (m) => { const p = m.new as Pt; setLive((s) => ({ ...s, [p.rider_id]: p })); }).subscribe();
    return () => { void c.removeChannel(ch); };
  }, []);
  const latest = useMemo(() => {
    const m: Record<string, Pt> = {};
    for (const p of q.data?.pts ?? []) if (!m[p.rider_id]) m[p.rider_id] = p;
    for (const [k, p] of Object.entries(live)) if (!m[k] || m[k].created_at < p.created_at) m[k] = p;
    return m;
  }, [q.data, live]);
  const name = (id: string) => { const r = (q.data?.riders ?? []).find((x) => x.id === id); return String(r?.full_name ?? r?.email ?? "rider"); };
  const markers: MapMarker[] = [
    ...Object.values(latest).map((p) => ({ id: `rider-${p.rider_id}`, lat: p.lat, lng: p.lng, kind: "rider" as const, label: `${name(p.rider_id)}${p.order_id ? ` · #${p.order_id}` : " · online"}` })),
    ...(q.data?.orders ?? []).flatMap((o) => {
      const r = o.restaurants as Row | null;
      return [
        ...(r?.lat ? [{ id: `rest-${String(r.name)}`, lat: Number(r.lat), lng: Number(r.lng), kind: "restaurant" as const, label: String(r.name) }] : []),
        ...(o.lat ? [{ id: `drop-${o.id}`, lat: Number(o.lat), lng: Number(o.lng), kind: "dropoff" as const, label: `#${o.id} drop-off` }] : []),
      ];
    }),
  ];
  return (
    <>
      <ErrorNote error={q.error} />
      <Panel title={`Live map · ${Object.keys(latest).length} rider(s) seen in the last 30 min · ${(q.data?.orders ?? []).length} active order(s)`}>
        <LiveMap markers={markers} height={460} />
        <p className="mt-2 text-xs text-muted">Riders share GPS only while online or on a delivery (with consent). Points are deleted after 7 days.</p>
      </Panel>
      <Panel title="Riders">
        <Table head={["Rider", "Online", "Last point", "Order"]} empty={Object.keys(latest).length === 0}>
          {Object.values(latest).map((p) => (
            <tr key={p.rider_id}><Td>{name(p.rider_id)}</Td><Td>{(q.data?.riders ?? []).find((x) => x.id === p.rider_id)?.online ? "🟢" : "⚪"}</Td><Td>{fmtDateTime(p.created_at)}</Td>
              <Td>{p.order_id ? <Link className="text-brand" href={`/admin/orders?id=${p.order_id}`}>#{p.order_id}</Link> : "—"} {p.order_id && <StatusBadge s={String((q.data?.orders ?? []).find((o) => Number(o.id) === p.order_id)?.status ?? "")} />}</Td></tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
