"use client";
import { useState } from "react";
import { ErrorNote, Panel, SmallBtn, Table, Td } from "@/components/admin";
import { downloadCsv, fmtDateTime, sb, useAdminQuery, type Row } from "@/lib/admin";
import { act } from "@/lib/act";

export default function AdminFeedback() {
  const [showDone, setShowDone] = useState(false);
  const q = useAdminQuery<Row[]>(async () => {
    const c = sb();
    let x = c.from("feedback").select("id, created_at, rating, message, page, email, user_id, user_agent, resolved_at").order("created_at", { ascending: false }).limit(500);
    if (!showDone) x = x.is("resolved_at", null);
    const r = await x;
    const ids = [...new Set((r.data ?? []).map((f) => f.user_id).filter(Boolean))] as string[];
    const p = ids.length ? await c.from("profiles").select("id, email, full_name").in("id", ids) : { data: [] as Row[] };
    const by = new Map((p.data ?? []).map((u) => [u.id, u]));
    return { data: (r.data ?? []).map((f) => ({ ...f, account: by.get(f.user_id as string) ?? null })), error: r.error };
  }, [showDone]);
  async function resolve(id: unknown, done: boolean) {
    const ok = await act((async () => { const { error } = await sb().from("feedback").update({ resolved_at: done ? new Date().toISOString() : null }).eq("id", Number(id)); if (error) throw new Error(error.message); return true; })(), done ? "Marked done" : "Reopened");
    if (ok) void q.reload();
  }
  const rows = q.data ?? [];
  return (
    <Panel title={`Feedback (${rows.length}${showDone ? "" : " open"})`} actions={<>
      <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show done</label>
      <SmallBtn onClick={() => downloadCsv("feedback.csv", rows.map((r) => ({ ...r, account: (r.account as Row | null)?.email ?? "" })), ["id", "created_at", "rating", "message", "page", "email", "account", "resolved_at"])}>⬇ CSV</SmallBtn></>}>
      <ErrorNote error={q.error} />
      <Table head={["When", "★", "Message", "From", "Page", ""]} empty={!q.loading && rows.length === 0}>
        {rows.map((f) => (
          <tr key={String(f.id)} data-testid="feedback-row">
            <Td>{fmtDateTime(f.created_at)}</Td>
            <Td>{f.rating ? `${String(f.rating)}★` : "—"}</Td>
            <Td><div className="max-w-[460px] whitespace-pre-wrap break-words">{String(f.message)}</div></Td>
            <Td>{String((f.account as Row | null)?.email ?? f.email ?? "anonymous")}</Td>
            <Td>{String(f.page ?? "")}</Td>
            <Td>{f.resolved_at ? <SmallBtn onClick={() => resolve(f.id, false)}>Reopen</SmallBtn> : <SmallBtn tone="ok" onClick={() => resolve(f.id, true)}>Done</SmallBtn>}</Td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
