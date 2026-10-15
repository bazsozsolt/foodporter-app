"use client";
import { useState } from "react";
import { ErrorNote, Panel, RangePicker, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { toast } from "@/components/Toaster";
import { act } from "@/lib/act";
import { downloadCsv, preset, sb, toIso, useAdminQuery, type Range, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

/** Finance pages: Payments (restaurant settlements) and Payouts (riders). */
export function FinancePage({ show }: { show: "restaurants" | "riders" }) {
  const [range, setRange] = useState<Range>(preset(show === "riders" ? "lastweek" : "30d"));
  return (
    <>
      <h1 className="mb-1 !font-sans !text-2xl font-bold !tracking-normal">{show === "riders" ? "Rider payouts" : "Restaurant payments"}</h1>
      <p className="mb-3 text-sm text-muted">{show === "riders" ? "Weekly rider payouts: pick the week, transfer, then mark each rider paid." : "What each restaurant earned, our commission and what is still owed."}</p>
      <div className="mb-3"><RangePicker value={range} onChange={(r) => { if (r.from > r.to) return toast("From must be before To"); setRange(r); }} /></div>
      <Payments range={range} show={show} />
    </>
  );
}

export function useReport(name: string, range: Range) {
  return useAdminQuery<Row>(async () => sb().rpc(name, toIso(range)), [name, range.from, range.to]);
}

export function Toolbar({ range, onCsv, title }: { range: Range; onCsv: () => void; title: string }) {
  return (
    <div className="flex gap-2">
      <SmallBtn onClick={onCsv}>⬇ CSV</SmallBtn>
      <SmallBtn onClick={() => { document.title = `Food Porter ${title} ${range.from}–${range.to}`; window.print(); }}>Print / PDF</SmallBtn>
    </div>
  );
}

export function Payments({ range, show }: { range: Range; show: "restaurants" | "riders" }) {
  const q = useReport("report_payments", range);
  const rs = ((q.data?.restaurants as Row[]) ?? []).filter((r) => Number(r.orders) > 0 || Number(r.owed_cents) > 0);
  const rd = (q.data?.riders as Row[]) ?? [];
  async function mark(kind: "rider" | "restaurant", id: string, name: string, owed: number) {
    const ref = prompt(`Mark ${eur(owed)} as paid to ${name} for ${range.from} → ${range.to}?\nOptional bank reference:`);
    if (ref === null) return;
    const fn = kind === "rider" ? "mark_rider_payout" : "mark_restaurant_payout";
    const args = { ...(kind === "rider" ? { p_rider: id } : { p_restaurant: id }), ...toIso(range), p_reference: ref || null };
    const ok = await act((async () => { const { error } = await sb().rpc(fn, args); if (error) throw new Error(error.message); return true; })(), `Recorded payout to ${name}`);
    if (ok !== undefined) q.reload();
  }
  const tot = (rows: Row[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  return (
    <>
      {show === "restaurants" && <Panel title={`Restaurant payouts · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="restaurant payouts" onCsv={() => downloadCsv(`restaurant_payouts_${range.from}_${range.to}.csv`, rs, ["restaurant", "commission_pct", "orders", "gross_cents", "commission_cents", "net_cents", "paid_cents", "owed_cents"])} />}>
        <ErrorNote error={q.error} />
        <Table head={["Restaurant", "Delivered orders", "Gross food sales", "Commission", "Net payout", "Paid", "Owed", ""]} empty={rs.length === 0}>
          {rs.map((r) => (
            <tr key={String(r.restaurant_id)}>
              <Td>{String(r.restaurant)} <span className="text-xs text-muted">({Number(r.commission_pct)}%)</span></Td><Td>{String(r.orders)}</Td>
              <Td>{eur(Number(r.gross_cents))}</Td><Td>{eur(Number(r.commission_cents))}</Td><Td>{eur(Number(r.net_cents))}</Td>
              <Td>{eur(Number(r.paid_cents))}</Td><Td className="font-bold">{eur(Number(r.owed_cents))}</Td>
              <Td>{Number(r.owed_cents) > 0 && <SmallBtn tone="ok" onClick={() => mark("restaurant", String(r.restaurant_id), String(r.restaurant), Number(r.owed_cents))}>Mark paid</SmallBtn>}</Td>
            </tr>
          ))}
          {rs.length > 0 && <tr className="font-bold"><Td>Total</Td><Td>{tot(rs, "orders")}</Td><Td>{eur(tot(rs, "gross_cents"))}</Td><Td>{eur(tot(rs, "commission_cents"))}</Td><Td>{eur(tot(rs, "net_cents"))}</Td><Td>{eur(tot(rs, "paid_cents"))}</Td><Td>{eur(tot(rs, "owed_cents"))}</Td><Td>{""}</Td></tr>}
        </Table>
      </Panel>}
      {show === "riders" && <Panel title={`Rider payouts · ${range.from} → ${range.to}`} actions={<Toolbar range={range} title="rider payouts" onCsv={() => downloadCsv(`rider_payouts_${range.from}_${range.to}.csv`, rd, ["rider", "status", "deliveries", "earned_cents", "paid_cents", "unpaid_cents"])} />}>
        <p className="mb-2 text-xs text-muted">Riders are paid weekly for the previous week: choose “Last week”, then mark each rider paid after the bank transfer.</p>
        <Table head={["Rider", "Status", "Deliveries", "Earned", "Paid", "Unpaid", ""]} empty={rd.length === 0}>
          {rd.map((r) => (
            <tr key={String(r.rider_id)}>
              <Td>{String(r.rider)}</Td><Td><StatusBadge s={String(r.status)} /></Td><Td>{String(r.deliveries)}</Td>
              <Td>{eur(Number(r.earned_cents))}</Td><Td>{eur(Number(r.paid_cents))}</Td><Td className="font-bold">{eur(Number(r.unpaid_cents))}</Td>
              <Td>{Number(r.unpaid_cents) > 0 && <SmallBtn tone="ok" onClick={() => mark("rider", String(r.rider_id), String(r.rider), Number(r.unpaid_cents))}>Mark paid</SmallBtn>}</Td>
            </tr>
          ))}
        </Table>
      </Panel>}
    </>
  );
}
