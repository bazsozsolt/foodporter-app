// Pure checks for the €15 delivery minimum helper and NL/EN copy. No network, no secrets.
import { effectiveMinOrderCents, minOrderMessage, minOrderShortfall, platformDeliveryMinCents, DEFAULT_MIN_DELIVERY_ORDER_CENTS } from "../../src/lib/minOrder.ts";
const eur = (cents) => "€" + (cents / 100).toFixed(2).replace(".", ",");

let fail = 0;
const ok = (name, cond) => { if (!cond) { fail++; console.log("FAIL " + name); } else console.log("PASS " + name); };

ok("default is €15", DEFAULT_MIN_DELIVERY_ORDER_CENTS === 1500);
ok("missing settings use the default", platformDeliveryMinCents(undefined) === 1500 && platformDeliveryMinCents({}) === 1500);
ok("settings value is used", platformDeliveryMinCents({ min_delivery_order_cents: 2000 }) === 2000);
ok("zero is allowed (admin can turn it off)", platformDeliveryMinCents({ min_delivery_order_cents: 0 }) === 0);

ok("delivery uses the higher of platform and restaurant", effectiveMinOrderCents({ pickup: false, restaurantMinCents: 900, platformDeliveryMinCents: 1500 }) === 1500);
ok("restaurant min can exceed the platform min", effectiveMinOrderCents({ pickup: false, restaurantMinCents: 2000, platformDeliveryMinCents: 1500 }) === 2000);
ok("pickup ignores the platform min", effectiveMinOrderCents({ pickup: true, restaurantMinCents: 0, platformDeliveryMinCents: 1500 }) === 0);
ok("pickup still uses the restaurant min", effectiveMinOrderCents({ pickup: true, restaurantMinCents: 900, platformDeliveryMinCents: 1500 }) === 900);

ok("shortfall", minOrderShortfall(1100, 1500) === 400 && minOrderShortfall(1500, 1500) === 0 && minOrderShortfall(2000, 1500) === 0);

const nl = minOrderMessage({ lang: "nl", pickup: false, min: eur(1500), need: eur(400), restaurantMinCents: 0, platformMinCents: 1500 });
const en = minOrderMessage({ lang: "en", pickup: false, min: eur(1500), need: eur(400), restaurantMinCents: 0, platformMinCents: 1500 });
ok("NL delivery message names the remaining amount and pickup exception",
  nl.testId === "min-delivery-order-warning" && nl.text.includes(eur(1500)) && nl.text.includes(eur(400)) && /afhalen/i.test(nl.text) && /gerechten/.test(nl.text));
ok("EN delivery message names the remaining amount and pickup exception",
  en.testId === "min-delivery-order-warning" && en.text.includes(eur(1500)) && en.text.includes(eur(400)) && /pickup/i.test(en.text) && /food subtotal/.test(en.text));
ok("NL and EN are different strings", nl.text !== en.text);

const nlPick = minOrderMessage({ lang: "nl", pickup: true, min: eur(900), need: eur(200), restaurantMinCents: 900, platformMinCents: 1500 });
const enPick = minOrderMessage({ lang: "en", pickup: true, min: eur(900), need: eur(200), restaurantMinCents: 900, platformMinCents: 1500 });
ok("pickup uses the restaurant wording, not the platform one",
  nlPick.testId === "min-order-warning" && /restaurant/.test(nlPick.text) && !/platformminimum/.test(nlPick.text)
  && enPick.testId === "min-order-warning" && /restaurant/.test(enPick.text) && !/platform minimum/.test(enPick.text));

console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
