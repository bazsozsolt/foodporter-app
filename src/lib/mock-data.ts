import type { Earning, MenuItem, Restaurant } from "./types";

// Example data only: these are not real partner restaurants.
export const DELIVERY_FEE_CENTS = 295;

export const restaurants: Restaurant[] = [
  { id: "spoorzone-burger", name: "Spoorzone Burger Co. (example)", cuisine: "Burgers", area: "Spoorzone", emoji: "🍔", color: "#ffe6d6", avg_prep_minutes: 15, commission_pct: 12, active: true },
  { id: "piushaven-pizza", name: "Piushaven Pizza (example)", cuisine: "Wood-fired pizza", area: "Piushaven", emoji: "🍕", color: "#ffe9e9", avg_prep_minutes: 20, commission_pct: 12, active: true },
  { id: "heuvel-noodle", name: "Heuvel Noodle Bar (example)", cuisine: "Asian", area: "Heuvel", emoji: "🍜", color: "#e8f3ff", avg_prep_minutes: 12, commission_pct: 12, active: true },
  { id: "korvel-kebab", name: "Korvel Kebab House (example)", cuisine: "Turkish", area: "Korvel", emoji: "🥙", color: "#eef8e6", avg_prep_minutes: 10, commission_pct: 12, active: true },
];

const raw: Record<string, [string, number][]> = {
  "spoorzone-burger": [["Smash Burger", 1150], ["Truffle Fries", 475], ["Veggie Burger", 1095], ["Milkshake", 450]],
  "piushaven-pizza": [["Margherita", 1050], ["Diavola", 1300], ["Tiramisu", 600]],
  "heuvel-noodle": [["Pad Thai", 1350], ["Ramen Shoyu", 1450], ["Gyoza (6)", 650]],
  "korvel-kebab": [["Durum Döner", 950], ["Lahmacun", 700], ["Ayran", 250]],
};

export const menuItems: MenuItem[] = Object.entries(raw).flatMap(([rid, items]) =>
  items.map(([name, price_cents], i) => ({ id: `${rid}-${i}`, restaurant_id: rid, name, price_cents })),
);

export const seedEarnings: Earning[] = [
  { id: "e1", rider_id: "rider-demo", order_id: "o-1001", restaurant_name: "Piushaven Pizza", amount_cents: 325, earned_at: "2026-10-05T18:10:00Z", payout_id: null },
  { id: "e2", rider_id: "rider-demo", order_id: "o-1002", restaurant_name: "Heuvel Noodle Bar", amount_cents: 295, earned_at: "2026-10-07T19:02:00Z", payout_id: null },
  { id: "e3", rider_id: "rider-demo", order_id: "o-1003", restaurant_name: "Spoorzone Burger Co.", amount_cents: 295, earned_at: "2026-10-09T12:40:00Z", payout_id: null },
  { id: "e4", rider_id: "rider-demo", order_id: "o-1004", restaurant_name: "Korvel Kebab", amount_cents: 350, earned_at: "2026-10-10T20:15:00Z", payout_id: null },
];
