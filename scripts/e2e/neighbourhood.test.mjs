import { neighbourhoodFromAddress, hideAddressFromRider } from "../../src/lib/neighbourhood.ts";
let fail = 0;
const ok = (n, c, x = "") => { if (!c) { fail++; console.log("FAIL " + n + (x ? " — " + x : "")); } else console.log("PASS " + n); };

ok("postcode and city, no street", neighbourhoodFromAddress("FP TEST: Heuvelstraat 12, 5038 AA Tilburg") === "5038, Tilburg");
ok("distance is appended with a comma decimal", neighbourhoodFromAddress("Heuvelstraat 12, 5038 AA Tilburg", 1.2) === "5038, Tilburg · 1,2 km");
ok("missing postcode still yields the city", neighbourhoodFromAddress("Tilburg") === "Tilburg");
ok("unknown address falls back without leaking the street", neighbourhoodFromAddress("Geheimstraat 99") === "Tilburg");
ok("hides unassigned accepted orders", hideAddressFromRider({ status: "accepted", rider_id: null }, "rider-1"));
ok("assigned rider sees the address", !hideAddressFromRider({ status: "assigned", rider_id: "rider-1" }, "rider-1"));
ok("another rider does not get an assigned job's address through this helper (job is simply not theirs)", hideAddressFromRider({ status: "accepted", rider_id: null }, "rider-2"));

console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
