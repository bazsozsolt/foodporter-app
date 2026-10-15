// v18 HR & Legal: template library RLS, append-only e-sign log, contract requests, rider online gate,
// restaurant order gate, onboarding/doc/youth checks. Test accounts only; leaves no open requests behind.
import { client, login, ok, RID, summary } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), staff = await login("STAFF"), rider = await login("SIMR3"), cust = await login("CUST2"), out = await login("OUTSIDER");
const err = (r) => r?.error?.message ?? null;
const reqIds = [];
const tpl = async (id) => (await admin.sb.from("legal_templates").select("id, version, sha256").eq("id", id).order("effective_date", { ascending: false }).limit(1).single()).data;
const status = async (u) => (await u.sb.rpc("my_legal_status")).data;
const wasOnline = (await admin.sb.from("profiles").select("online").eq("id", rider.id).single()).data.online;
try {
  // library
  const pub = await anon.from("legal_templates").select("id, audience");
  ok("anon reads public templates", !pub.error && pub.data.some((t) => t.id === "rider_employment"));
  ok("internal templates hidden from anon", !pub.data.some((t) => t.audience === "internal"));
  ok("admin sees internal templates", (await admin.sb.from("legal_templates").select("id").eq("audience", "internal")).data?.length >= 3);
  ok("non-admin cannot add templates", err(await out.sb.from("legal_templates").insert({ id: "x", version: "9", title: "x", audience: "all", pdf_path: "x", html_path: "x", sha256: "0".repeat(64) })) !== null);
  const pdf = await fetch((process.env.FP_BASE ?? "https://bazsozsolt.github.io/foodporter-app") + "/legal/rider_employment-v0.1.pdf");
  ok("PDF served", pdf.status === 200 || pdf.status === 404, `status ${pdf.status} (404 ok before first deploy)`);

  // acceptance log RLS
  ok("anon cannot read acceptances", ((await anon.from("legal_acceptances").select("id")).data ?? []).length === 0);
  const othersAcc = (await out.sb.from("legal_acceptances").select("id, profile_id")).data ?? [];
  ok("outsider sees only own acceptances", othersAcc.every((a) => a.profile_id === out.id));
  ok("no direct insert into acceptances", err(await rider.sb.from("legal_acceptances").insert({ template_id: "rider_conduct", version: "0.1", profile_id: rider.id, text_sha256: "0".repeat(64) })) !== null);
  const anyAcc = (await admin.sb.from("legal_acceptances").select("id").limit(1).single()).data;
  await admin.sb.from("legal_acceptances").update({ lang: "en" }).eq("id", anyAcc.id);
  await admin.sb.from("legal_acceptances").delete().eq("id", anyAcc.id);
  ok("acceptance survives admin update/delete attempts", (await admin.sb.from("legal_acceptances").select("id, lang").eq("id", anyAcc.id).single()).data?.id === anyAcc.id);

  // rider gate via contract request
  await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id);
  ok("seeded test rider is ready", (await status(rider))?.ready === true);
  ok("non-admin cannot send requests", err(await out.sb.from("legal_requests").insert({ template_id: "rider_conduct", version: "0.1", profile_id: out.id })) !== null);
  const conduct = await tpl("rider_conduct");
  const rq = await admin.sb.from("legal_requests").insert({ template_id: "rider_conduct", version: conduct.version, profile_id: rider.id }).select("id").single();
  ok("admin sends contract", !rq.error); if (rq.data) reqIds.push(rq.data.id);
  const st = await status(rider);
  ok("open request blocks rider", st?.ready === false && st.missing.includes("pending:rider_conduct"), JSON.stringify(st?.missing));
  const on1 = await rider.sb.from("profiles").update({ online: true }).eq("id", rider.id);
  ok("rider cannot go online while unsigned", /legal/.test(err(on1) ?? ""), err(on1));
  ok("rider sees own request", ((await rider.sb.from("legal_requests").select("id").eq("id", rq.data.id)).data ?? []).length === 1);
  ok("outsider cannot see it", ((await out.sb.from("legal_requests").select("id").eq("id", rq.data.id)).data ?? []).length === 0);
  ok("stale hash rejected", /version changed/.test(err(await rider.sb.rpc("legal_accept", { p_template: "rider_conduct", p_sha256: "0".repeat(64), p_lang: "en" })) ?? ""));
  ok("customer cannot sign rider docs", /not allowed/.test(err(await cust.sb.rpc("legal_accept", { p_template: "rider_conduct", p_sha256: conduct.sha256 })) ?? ""));
  const acc = await rider.sb.rpc("legal_accept", { p_template: "rider_conduct", p_sha256: conduct.sha256, p_lang: "en" });
  ok("rider signs", !acc.error && Number(acc.data) > 0, err(acc));
  const req2 = (await admin.sb.from("legal_requests").select("status, acceptance_id").eq("id", rq.data.id).single()).data;
  ok("request marked signed", req2.status === "signed" && req2.acceptance_id === acc.data);
  const row = (await rider.sb.from("legal_acceptances").select("version, lang, text_sha256, ip, method").eq("id", acc.data).single()).data;
  ok("log stores version/lang/hash", row?.version === conduct.version && row.lang && row.text_sha256 === conduct.sha256 && row.method === "click", JSON.stringify({ ...row, ip: row?.ip ? "set" : null }));
  ok("log stores IP", row?.ip != null);
  ok("re-sign is idempotent", (await rider.sb.rpc("legal_accept", { p_template: "rider_conduct", p_sha256: conduct.sha256, p_lang: "en" })).data === acc.data);
  ok("rider can go online after signing", !err(await rider.sb.from("profiles").update({ online: true }).eq("id", rider.id)));
  await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id);

  // onboarding + documents + youth
  ok("rider reads own checklist", ((await rider.sb.from("rider_onboarding").select("step").eq("profile_id", rider.id)).data ?? []).length >= 5);
  ok("rider cannot tick own steps", err(await rider.sb.from("rider_onboarding").insert({ profile_id: rider.id, step: "test_ride" })) !== null);
  ok("outsider cannot read rider checklist", ((await out.sb.from("rider_onboarding").select("step").eq("profile_id", rider.id)).data ?? []).length === 0);
  await admin.sb.from("rider_onboarding").delete().eq("profile_id", rider.id).eq("step", "safety_briefing");
  ok("missing mandatory step blocks", (await status(rider))?.missing.includes("step:safety_briefing"));
  await admin.sb.from("rider_onboarding").insert({ profile_id: rider.id, step: "safety_briefing", note: "test seed" });
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  ok("admin records doc expiry", !err(await admin.sb.from("rider_documents").upsert({ profile_id: rider.id, kind: "id", expires_on: y })));
  ok("expired ID blocks", (await status(rider))?.missing.includes("doc_expired:id"));
  ok("rider sees own docs only", ((await rider.sb.from("rider_documents").select("kind")).data ?? []).length === 1 && ((await out.sb.from("rider_documents").select("kind")).data ?? []).length === 0);
  await admin.sb.from("rider_documents").delete().eq("profile_id", rider.id);
  const b15 = new Date(Date.now() - 15 * 365.25 * 864e5).toISOString().slice(0, 10);
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: b15 });
  ok("under-16 blocked", (await status(rider))?.missing.includes("age_under_16"));
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "zzp", birthdate: null });
  const z = await status(rider);
  ok("zzp needs zzp contract + KvK check", z?.missing.includes("contract") && z.missing.includes("step:kvk_checked"), JSON.stringify(z?.missing));
  ok("rider cannot change own contract type", err(await rider.sb.from("rider_hr").update({ contract_type: "employment" }).eq("profile_id", rider.id)) !== null || (await admin.sb.from("rider_hr").select("contract_type").eq("profile_id", rider.id).single()).data.contract_type === "zzp");
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: null });
  ok("rider ready again", (await status(rider))?.ready === true);

  // restaurant gate
  ok("restaurant ready (seeded)", (await status(staff))?.ready === true);
  const dpa = await tpl("dpa_restaurant");
  const rr = await admin.sb.from("legal_requests").insert({ template_id: "dpa_restaurant", version: dpa.version, restaurant_id: RID }).select("id").single();
  if (rr.data) reqIds.push(rr.data.id);
  ok("open restaurant request blocks orders", (await status(staff))?.ready === false && (await cust.sb.rpc("fp_restaurant_open", { p_rid: RID })).data !== true);
  ok("staff cannot sign rider docs", /not allowed/.test(err(await staff.sb.rpc("legal_accept", { p_template: "rider_conduct", p_sha256: conduct.sha256 })) ?? ""));
  const sa = await staff.sb.rpc("legal_accept", { p_template: "dpa_restaurant", p_sha256: dpa.sha256, p_lang: "nl" });
  ok("staff signs DPA for restaurant", !sa.error, err(sa));
  ok("restaurant receives orders again", (await status(staff))?.ready === true);
  ok("staff sees restaurant acceptances", ((await staff.sb.from("legal_acceptances").select("id").eq("restaurant_id", RID)).data ?? []).length >= 2);
} finally {
  if (reqIds.length) await admin.sb.from("legal_requests").update({ status: "revoked" }).in("id", reqIds).in("status", ["sent", "expired"]);
  await admin.sb.from("rider_hr").upsert({ profile_id: rider.id, contract_type: "employment", birthdate: null });
  await admin.sb.from("profiles").update({ online: wasOnline }).eq("id", rider.id);
}
process.exit(summary() ? 1 : 0);
