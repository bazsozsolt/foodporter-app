// v33: create/delete throwaway test users WITHOUT sending email (email confirmation is on).
// Service key is fetched at runtime via the Management API (SUPABASE_ACCESS_TOKEN env), never stored or printed.
// CLI: node admin-user.mjs create <email> <password> [unconfirmed] | delete <email>
import { createClient } from "@supabase/supabase-js";
import WS from "ws";
import { SB_URL } from "./common.mjs";
const REF = new URL(SB_URL).hostname.split(".")[0];
let adminClient;
async function admin() {
  if (adminClient) return adminClient;
  const tok = process.env.SUPABASE_ACCESS_TOKEN; if (!tok) throw new Error("SUPABASE_ACCESS_TOKEN not set");
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
  const k = keys.find((x) => x.name === "service_role")?.api_key; if (!k) throw new Error("no service key");
  return (adminClient = createClient(SB_URL, k, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WS } }));
}
export async function createTestUser(email, password, { confirmed = true, full_name = "FP TEST" } = {}) {
  const { data, error } = await (await admin()).auth.admin.createUser({ email, password, email_confirm: confirmed, user_metadata: { full_name } });
  if (error) throw error; return data.user;
}
export async function deleteTestUser(email) {
  const a = await admin();
  // listUsers 500s on this project (anonymised erased rows), so look the id up with SQL via the Management API.
  const q = `select id from auth.users where lower(email) = lower('${email.replace(/'/g, "''")}')`;
  const rows = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) })).json();
  for (const r of rows) { const d = await a.auth.admin.deleteUser(r.id); if (d.error) throw d.error; }
  return rows.length > 0;
}
if (process.argv[1]?.endsWith("admin-user.mjs")) {
  const [cmd, email, pw, flag] = process.argv.slice(2);
  if (cmd === "create") { const u = await createTestUser(email, pw, { confirmed: flag !== "unconfirmed" }); console.log(u.id); }
  else if (cmd === "delete") console.log(await deleteTestUser(email));
  else { console.error("usage"); process.exit(2); }
}
