// Retention job (privacy statement v0.4): delivery-proof photos 30 days after delivery; support tickets (+ messages and
// photos) 2 years after closing; order chat 6 months after the order is completed.
// Called daily by pg_cron via pg_net. Idempotent and only removes data that is past its retention, so it needs no caller auth.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("fp_expired_proofs", { p_limit: 500 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as { order_id: number | null; path: string }[];
  let removed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const r = await db.storage.from("delivery-proof").remove(chunk.map((x) => x.path));
    if (r.error) return Response.json({ error: r.error.message, removed }, { status: 500 });
    removed += chunk.length;
    const ids = chunk.map((x) => x.order_id).filter((x): x is number => x != null);
    if (ids.length) await db.from("orders").update({ delivery_photo_path: null }).in("id", ids);
  }
  // Support photos of expired tickets first (storage), then the rows themselves (tickets + messages, order chat).
  const sp = await db.rpc("fp_expired_support_photos", { p_limit: 500 });
  if (sp.error) return Response.json({ error: sp.error.message, removed }, { status: 500 });
  const paths = ((sp.data ?? []) as { path: string }[]).map((x) => x.path);
  for (let i = 0; i < paths.length; i += 100) {
    const r = await db.storage.from("support-photos").remove(paths.slice(i, i + 100));
    if (r.error) return Response.json({ error: r.error.message, removed }, { status: 500 });
  }
  const pg = await db.rpc("fp_purge_support_chat");
  if (pg.error) return Response.json({ error: pg.error.message, removed }, { status: 500 });
  return Response.json({ removed, support_photos: paths.length, ...(pg.data as Record<string, number>) });
});
