// Pure checks for the €15 delivery minimum helper and NL/EN copy. No network, no secrets.
import { effectiveMinOrderCents, evaluateMinOrder, foodTotalAfterDiscountCents, minOrderMessage, minOrderShortfall, platformDeliveryMinCents, DEFAULT_MIN_DELIVERY_ORDER_CENTS } from "../../src/lib/minOrder.ts";
const eur = (cents) => "€" + (cents / 100).toFixed(2).replace(".", ",");

let fail = 0;
const ok = (name, cond) => { if (!cond) { fail++; console.log("FAIL " + name); } else console.log("PASS " + name); };

ok("default is €15", DEFAULT_MIN_DELIVERY_ORDER_CENTS === 1500);
ok("missing settings use the default", platformDeliveryMinCents(undefined) === 1500 && platformDeliveryMinCents({}) === 1500);
ok("settings value is used", platformDeliveryMinCents({ min_delivery_order_cents: 2000 }) === 2000);
ok("zero is allowed (admin can turn it off)", platformDeliveryMinCents({ min_delivery_order_cents: 0 }) === 0);

ok("delivery uses the higher of platform and restaurant when there is no discount", effectiveMinOrderCents({ pickup: false, restaurantMinCents: 900, platformDeliveryMinCents: 1500 }) === 1500);
ok("restaurant min can exceed the platform min", effectiveMinOrderCents({ pickup: false, restaurantMinCents: 2000, platformDeliveryMinCents: 1500 }) === 2000);
ok("pickup ignores the platform min", effectiveMinOrderCents({ pickup: true, restaurantMinCents: 0, platformDeliveryMinCents: 1500 }) === 0);
ok("pickup still uses the restaurant min", effectiveMinOrderCents({ pickup: true, restaurantMinCents: 900, platformDeliveryMinCents: 1500 }) === 900);

ok("shortfall", minOrderShortfall(1100, 1500) === 400 && minOrderShortfall(1500, 1500) === 0 && minOrderShortfall(2000, 1500) === 0);

ok("food after a promo", foodTotalAfterDiscountCents(2000, 600, 0) === 1400);
ok("food after credit", foodTotalAfterDiscountCents(2000, 0, 600) === 1400);
ok("food after promo and credit", foodTotalAfterDiscountCents(2000, 400, 200) === 1400);
ok("100% promo is €0 food", foodTotalAfterDiscountCents(1500, 1500, 0) === 0);
ok("over-discount cannot go negative", foodTotalAfterDiscountCents(1000, 5000, 0) === 0 && foodTotalAfterDiscountCents(1000, 0, 5000) === 0);

const promoDrop = evaluateMinOrder({ pickup: false, subtotalCents: 2000, discountCents: 600, platformDeliveryMinCents: 1500 });
ok("promo pushing delivery below €15 is blocked", promoDrop.belowMin && promoDrop.platformBelow && !promoDrop.restaurantBelow && promoDrop.needCents === 100 && promoDrop.foodAfterCents === 1400 && promoDrop.bind === "platform");
const creditDrop = evaluateMinOrder({ pickup: false, subtotalCents: 2000, creditCents: 600, platformDeliveryMinCents: 1500 });
ok("credit pushing delivery below €15 is blocked", creditDrop.belowMin && creditDrop.needCents === 100 && creditDrop.bind === "platform");
ok("the same promo on pickup is allowed", !evaluateMinOrder({ pickup: true, subtotalCents: 2000, discountCents: 600, platformDeliveryMinCents: 1500 }).belowMin);
ok("the same credit on pickup is allowed", !evaluateMinOrder({ pickup: true, subtotalCents: 2000, creditCents: 600, platformDeliveryMinCents: 1500 }).belowMin);
ok("delivery at €15 after a promo is allowed", !evaluateMinOrder({ pickup: false, subtotalCents: 2000, discountCents: 500, platformDeliveryMinCents: 1500 }).belowMin);
const full = evaluateMinOrder({ pickup: false, subtotalCents: 1500, discountCents: 1500, platformDeliveryMinCents: 1500 });
ok("a 100% promo on delivery needs the full €15 back", full.belowMin && full.foodAfterCents === 0 && full.needCents === 1500);

const restOkPlatformFail = evaluateMinOrder({ pickup: false, subtotalCents: 1600, discountCents: 200, restaurantMinCents: 1500, platformDeliveryMinCents: 1500 });
ok("restaurant min stays on the item subtotal before discounts", !restOkPlatformFail.restaurantBelow && restOkPlatformFail.platformBelow && restOkPlatformFail.bind === "platform" && restOkPlatformFail.needCents === 100);
const restFail = evaluateMinOrder({ pickup: false, subtotalCents: 1400, discountCents: 0, restaurantMinCents: 1600, platformDeliveryMinCents: 1500 });
ok("restaurant min still uses the pre-discount subtotal when it is the stricter rule", restFail.restaurantBelow && restFail.bind === "restaurant" && restFail.needCents === 200);

const nl = minOrderMessage({ lang: "nl", pickup: false, min: eur(1500), need: eur(400), restaurantMinCents: 0, platformMinCents: 1500, bind: "platform" });
const en = minOrderMessage({ lang: "en", pickup: false, min: eur(1500), need: eur(400), restaurantMinCents: 0, platformMinCents: 1500, bind: "platform" });
ok("NL delivery message names the remaining amount, after-discount basis, and pickup exception",
  nl.testId === "min-delivery-order-warning" && nl.text.includes(eur(1500)) && nl.text.includes(eur(400)) && /afhalen/i.test(nl.text) && /gerechten/.test(nl.text) && /na korting/.test(nl.text) && /tegoed/.test(nl.text));
ok("EN delivery message names the remaining amount, after-discount basis, and pickup exception",
  en.testId === "min-delivery-order-warning" && en.text.includes(eur(1500)) && en.text.includes(eur(400)) && /pickup/i.test(en.text) && /food total/.test(en.text) && /after discount/.test(en.text) && /credit/.test(en.text));
ok("NL and EN are different strings", nl.text !== en.text);

const nlPick = minOrderMessage({ lang: "nl", pickup: true, min: eur(900), need: eur(200), restaurantMinCents: 900, platformMinCents: 1500, bind: "restaurant" });
const enPick = minOrderMessage({ lang: "en", pickup: true, min: eur(900), need: eur(200), restaurantMinCents: 900, platformMinCents: 1500, bind: "restaurant" });
ok("pickup uses the restaurant wording, not the platform one",
  nlPick.testId === "min-order-warning" && /restaurant/.test(nlPick.text) && !/platformminimum/.test(nlPick.text) && !/na korting/.test(nlPick.text)
  && enPick.testId === "min-order-warning" && /restaurant/.test(enPick.text) && !/platform minimum/.test(enPick.text) && !/after discount/.test(enPick.text));

console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
