// helper for v20.ui.py: test data for SIMR3 only. modes: pay | rest | clean
import { login } from "./common.mjs";
const admin = await login("ADMIN"), rider = await login("SIMR3");
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const sess = (a, b) => admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: a, clock_out: b, closed_by: "admin", is_test: true });
const mode = process.argv[2];
// Seed into the PREVIOUS calendar week (Mon-based) so "Vorige week" always shows it, whatever today is.
const pm = new Date(); pm.setUTCHours(0, 0, 0, 0); pm.setUTCDate(pm.getUTCDate() - ((pm.getUTCDay() + 6) % 7) - 7);
const d = (off, hh) => { const x = new Date(pm); x.setUTCDate(x.getUTCDate() + off); x.setUTCHours(hh); return x.toISOString(); };
if (mode === "pay") {
  await sess(d(6, 10), d(6, 12)); await sess(d(4, 19), d(4, 21)); await sess(d(5, 10), d(5, 11));
  await admin.sb.from("rider_shifts").insert({ rider_id: rider.id, starts_at: d(5, 10), ends_at: d(5, 14) });
} else if (mode === "rest") {
  await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id);
  await sess(ago(780), ago(600));
} else {
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).eq("is_test", true).gte("clock_in", d(-1, 0));
  await admin.sb.from("rider_shifts").delete().eq("rider_id", rider.id);
}
console.log("ok " + mode + " rider " + rider.id);
process.exit(0);
