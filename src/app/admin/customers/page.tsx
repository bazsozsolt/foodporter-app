"use client";
import { useState } from "react";
import { ErrorNote, inputCls, Panel, SmallBtn, StatusBadge, Table, Td } from "@/components/admin";
import { act } from "@/lib/act";
import { downloadCsv, fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { eur } from "@/lib/format";

async function update(id: string, p: Row) {
  const { error } = await sb().from("profiles").update(p).eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export default function CustomersAdmin() {
  const q = useAdminQuery<{ people: Row[]; orders: Row[]; rest: Row[] }>(async () => {
    const c = sb();
    const [p, o, r] = await Promise.all([
      c.from("profiles").select("*").order("created_at", { ascending: false }),
      c.from("orders").select("customer_id, subtotal_cents, status, created_at"),
      c.from("restaurants").select("id, name").order("name"),
    ]);
    return { data: { people: p.data ?? [], orders: o.data ?? [], rest: r.data ?? [] }, error: p.error ?? o.error };
  }, []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const people = (q.data?.people ?? []).filter((p) => (roleFilter === "all" || p.role === roleFilter) &&
    (!search || `${p.email ?? ""} ${p.full_name ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const stats = (id: string) => {
    const o = (q.data?.orders ?? []).filter((x) => x.customer_id === id && !["awaiting_payment", "payment_failed"].includes(String(x.status)));
    return { n: o.length, spent: o.reduce((a, x) => a + Number(x.subtotal_cents), 0), last: o.map((x) => String(x.created_at)).sort().pop() };
  };
  return (
    <Panel title={`Accounts (${people.length})`} actions={<SmallBtn onClick={() => downloadCsv("accounts.csv", people.map((p) => ({ email: p.email, name: p.full_name, role: p.role, status: p.status, created_at: p.created_at, orders: stats(String(p.id)).n })))}>⬇ CSV</SmallBtn>}>
      <ErrorNote error={q.error} />
      <div className="no-print mb-3 flex flex-wrap gap-2">
        <input className={`${inputCls} max-w-xs`} placeholder="Search email, name, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className={`${inputCls} w-40`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          {["customer", "rider", "restaurant", "admin", "all"].map((r) => <option key={r} value={r}>{r === "all" ? "All roles" : `${r}s`}</option>)}
        </select>
      </div>
      <Table head={["Account", "Role", "Status", "Orders", "Spent", "Last order", ""]} empty={!q.loading && people.length === 0}>
        {people.map((p) => {
          const s = stats(String(p.id));
          return (
            <tr key={String(p.id)}>
              <Td><b>{String(p.full_name ?? "—")}</b><div className="text-xs text-muted">{String(p.email ?? "")}</div></Td>
              <Td>
                <select aria-label="Role" className={`${inputCls} w-32`} value={String(p.role)} disabled={p.role === "admin"}
                  onChange={async (e) => { if (await act(update(String(p.id), { role: e.target.value, status: e.target.value === "rider" ? "pending" : p.status }), "Role updated") !== undefined) q.reload(); }}>
                  {["customer", "rider", "restaurant", "admin"].map((r) => <option key={r} value={r} disabled={r === "admin"}>{r}</option>)}
                </select>
                {p.role === "restaurant" && (
                  <select aria-label="Restaurant" className={`${inputCls} mt-1 w-40`} value={String(p.restaurant_id ?? "")}
                    onChange={async (e) => { if (await act(update(String(p.id), { restaurant_id: e.target.value || null }), "Restaurant linked") !== undefined) q.reload(); }}>
                    <option value="">— link restaurant —</option>
                    {(q.data?.rest ?? []).map((r) => <option key={String(r.id)} value={String(r.id)}>{String(r.name)}</option>)}
                  </select>
                )}
              </Td>
              <Td><StatusBadge s={String(p.status)} /></Td>
              <Td>{s.n}</Td><Td>{eur(s.spent)}</Td><Td>{fmtDateTime(s.last)}</Td>
              <Td className="text-right">
                {p.role !== "admin" && (p.status === "blocked"
                  ? <SmallBtn tone="ok" onClick={async () => { if (await act(update(String(p.id), { status: "active", status_reason: null }), "Unblocked") !== undefined) q.reload(); }}>Unblock</SmallBtn>
                  : <SmallBtn tone="danger" onClick={async () => { const why = prompt("Reason for blocking?"); if (why === null) return; if (await act(update(String(p.id), { status: "blocked", status_reason: why }), "Blocked (can no longer order)") !== undefined) q.reload(); }}>Block</SmallBtn>)}
              </Td>
            </tr>
          );
        })}
      </Table>
    </Panel>
  );
}
