// End of the simulated evening: riders finish what they hold; ops cancels orders that never got a bid (refund path).
import { login, sleep } from "../e2e/common.mjs";
const admin = await login("ADMIN");
const riders = Object.fromEntries(await Promise.all(["RIDER", "SIMR1", "SIMR2", "SIMR3"].map(async (k) => { const r = await login(k); return [r.id, r]; })));
const ids = process.argv.slice(2).map(Number);
for (let round = 0; round < 12; round++) {
  const { data: os } = await admin.sb.from("orders").select("id,status,rider_id,bid_alerted_at").in("id", ids);
  let open = 0;
  for (const o of os) {
    const r = riders[o.rider_id];
    if (["assigned", "ready", "picked_up"].includes(o.status) && r) {
      if (o.status === "assigned") await admin.sb.from("orders").update({ status: "ready" }).eq("id", o.id);
      if (o.status !== "picked_up") await r.sb.from("orders").update({ status: "picked_up" }).eq("id", o.id);
      const d = await r.sb.from("orders").update({ status: "delivered" }).eq("id", o.id).select("id");
      console.log("delivered", o.id, d.error?.message ?? "");
    } else if (o.status === "accepted" && o.bid_alerted_at) {
      const c = await admin.sb.from("orders").update({ status: "cancelled", cancel_reason: "admin_cancelled" }).eq("id", o.id).select("id");
      console.log("ops cancelled (no bid)", o.id, c.error?.message ?? "");
    } else if (!["delivered", "cancelled"].includes(o.status)) open++;
  }
  if (!open) break;
  await sleep(30000);
}
process.exit(0);
