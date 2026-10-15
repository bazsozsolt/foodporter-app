// helper for v20.ui.py: test data for SIMR3 only. modes: pay | rest | clean
import { login } from "./common.mjs";
const admin = await login("ADMIN"), rider = await login("SIMR3");
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const sess = (a, b) => admin.sb.from("work_sessions").insert({ rider_id: rider.id, clock_in: a, clock_out: b, closed_by: "admin", is_test: true });
const mode = process.argv[2];
if (mode === "pay") {
  await sess("2026-10-11T10:00:00Z", "2026-10-11T12:00:00Z"); await sess("2026-10-09T19:00:00Z", "2026-10-09T21:00:00Z"); await sess("2026-10-10T10:00:00Z", "2026-10-10T11:00:00Z");
  await admin.sb.from("rider_shifts").insert({ rider_id: rider.id, starts_at: "2026-10-10T10:00:00Z", ends_at: "2026-10-10T14:00:00Z" });
} else if (mode === "rest") {
  await admin.sb.from("profiles").update({ online: false }).eq("id", rider.id);
  await sess(ago(780), ago(600));
} else {
  await admin.sb.from("work_sessions").delete().eq("rider_id", rider.id).eq("is_test", true).gte("clock_in", "2026-10-05T00:00:00Z");
  await admin.sb.from("rider_shifts").delete().eq("rider_id", rider.id);
}
console.log("ok " + mode + " rider " + rider.id);
process.exit(0);
