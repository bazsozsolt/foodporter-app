// Retention job (privacy statement v0.3): delivery-proof photos are deleted 30 days after delivery.
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
  return Response.json({ removed });
});
