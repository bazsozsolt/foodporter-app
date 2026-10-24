// v25: admin erasure deletes the auth login. Uses a throwaway user created here.
import { login, client, ok, errOf, summary } from "./common.mjs";
import { createTestUser } from "./admin-user.mjs";
import crypto from "node:crypto";
const admin = await login("ADMIN"), cust = await login("SIMC1");
const email = `fp-erase-${crypto.randomBytes(4).toString("hex")}@example.com`;
const pw = crypto.randomBytes(12).toString("base64url") + "Aa1!";
const t = client();
// v33: email confirmation is on, so create the throwaway confirmed via the admin API (no email sent)
let tid, cerr = null; try { tid = (await createTestUser(email, pw, { full_name: "FP TEST erase" })).id; } catch (e) { cerr = e.message; }
ok("throwaway user created", !!tid, cerr ?? "");
const li = await t.auth.signInWithPassword({ email, password: pw }); ok("throwaway can log in", !li.error, errOf(li));
const rq = await t.rpc("fp_request_account_deletion"); ok("throwaway requests deletion", !rq.error, errOf(rq));
let r = await cust.sb.rpc("fp_erase_account", { p_id: tid }); ok("customer cannot erase", !!r.error);
r = await t.rpc("fp_erase_account", { p_id: tid }); ok("user cannot erase via rpc", !!r.error);
r = await admin.sb.rpc("fp_erase_account", { p_id: admin.id }); ok("refuses admins", /admin/i.test(errOf(r) ?? ""), errOf(r));
const { data: o } = await admin.sb.from("orders").select("customer_id").eq("id", 1043).maybeSingle();
r = await admin.sb.rpc("fp_erase_account", { p_id: o?.customer_id }); ok("refuses 1043/1046 owner", /protected/i.test(errOf(r) ?? ""), errOf(r));
r = await admin.sb.rpc("fp_erase_account", { p_id: tid }); ok("admin erases throwaway", !r.error, errOf(r));
const again = await client().auth.signInWithPassword({ email, password: pw }); ok("login gone", !!again.error, errOf(again));
const { data: p } = await admin.sb.from("profiles").select("full_name, email, phone").eq("id", tid).maybeSingle();
ok("anonymised profile row kept", p?.full_name === "Verwijderde gebruiker" && !p.email && !p.phone, JSON.stringify(p));
const { data: tk } = await admin.sb.from("support_tickets").select("id").eq("created_by", tid).neq("status", "resolved");
for (const x of tk ?? []) await admin.sb.rpc("support_admin_update", { p_ticket: x.id, p_status: "resolved" });
process.exit(summary() ? 1 : 0);
