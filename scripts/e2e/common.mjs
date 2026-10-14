import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import WS from "ws";
const env = Object.fromEntries(fs.readFileSync(new URL("../../.env.local", import.meta.url),"utf8").split("\n").filter(l=>l.includes("=")).map(l=>l.split(/=(.*)/s).slice(0,2)));
export const creds = Object.fromEntries(fs.readFileSync(process.env.FP_TEST_CREDS ?? "/workspace/fptest/.creds","utf8").trim().split("\n").map(l=>l.split(/=(.*)/s).slice(0,2)));
export const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const client = () => createClient(SB_URL, ANON, { auth: { persistSession: false }, realtime: { transport: WS } });
export async function login(role) {
  const sb = client(); const email = creds[role+"_EMAIL"], password = creds[role+"_PASSWORD"];
  let r = await sb.auth.signInWithPassword({ email, password });
  if (r.error) { r = await sb.auth.signUp({ email, password, options: { data: { full_name: "Test " + role.toLowerCase() } } }); if (r.error) throw r.error; }
  return { sb, id: r.data.user.id, session: r.data.session };
}
export let pass = 0, fail = 0;
export const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log((cond ? "PASS " : "FAIL ") + name + (extra ? " — " + extra : "")); };
export const errOf = (r) => r?.error?.message ?? null;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const RID = process.env.FP_TEST_RESTAURANT ?? "187f751c-bebb-4a34-9d4b-9b1a9e8851db"; // 't Kaasbolleke (OSM test restaurant)
export const ADDRESS = "FP TEST: Heuvelstraat 12, 5038 AA Tilburg"; // public street address, not a person's
export function summary() { console.log(`\n${pass} passed, ${fail} failed`); return fail; }
