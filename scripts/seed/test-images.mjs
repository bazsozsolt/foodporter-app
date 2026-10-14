// Licensed test images (Openverse: CC0 / CC BY, attribution stored per row) for TEST restaurants and dishes only.
// Images live in menu-photos/library/<key>.webp (640x480 WebP). Real (non-test) restaurants are never touched.
// Usage: node scripts/seed/test-images.mjs /workspace/fpimg
import fs from "fs";
import { login } from "../e2e/common.mjs";
const dir = process.argv[2] ?? "/workspace/fpimg";
const credits = JSON.parse(fs.readFileSync(new URL("./test-image-credits.json", import.meta.url)));
const admin = await login("ADMIN"); const sb = admin.sb;
const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://joontqbhfqjqkyhlifle.supabase.co"}/storage/v1/object/public/menu-photos/library/`;
for (const k of Object.keys(credits)) {
  const { error } = await sb.storage.from("menu-photos").upload(`library/${k}.webp`, fs.readFileSync(`${dir}/${k}.webp`), { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (error && !/exists/i.test(error.message)) { console.error("upload", k, error.message); process.exit(1); }
}
const credit = (k) => { const c = credits[k]; return `“${(c.title ?? "").slice(0, 80)}” by ${c.creator || "unknown"}, ${c.license === "cc0" ? "CC0" : `CC BY ${c.license_version ?? ""}`.trim()} · ${c.source}`; };
// cuisine -> image key
const CUISINE = { pizza: "pizza", "wood-fired pizza": "pizza", italian: "pizza", burgers: "burger", sushi: "sushi", japanese: "sushi", kebab: "kebab", turkish: "kebab", shawarma: "shawarma", shoarma: "shawarma",
  "dutch snacks": "fries", chicken: "grill", grill: "grill", chinese: "noodles", asian: "noodles", indian: "curry", indonesian: "nasi", javaans: "nasi", surinamese: "roti", sandwiches: "sandwich", lunch: "sandwich",
  steakhouse: "steak", mexican: "taco", greek: "mezze", mediterranean: "falafel", moroccan: "tagine", afghan: "curry", pancake: "pancake", korean: "bibimbap", thai: "thai", vietnamese: "pho", hawaiian: "poke",
  fish: "fish", tapas: "tapas", polish: "pierogi", french: "croissant", international: "plate", restaurant: "plate" };
// dish name keywords -> image key (first match wins)
const DISH = [[/pizza|margherita|pepperoni|calzone|funghi|quattro/i, "pizza"], [/burger/i, "burger"], [/sushi|maki|nigiri|sashimi|roll/i, "sushi"], [/d[öo]ner|kebab|kapsalon/i, "kebab"],
  [/shoarma|shawarma|gyros|wrap/i, "shawarma"], [/friet|frites|fries|patat|kroket|frikandel|bitterbal|snack/i, "fries"], [/kip|chicken|wings|sat[ée]/i, "grill"], [/noedel|noodle|bami|mie|chow|wok/i, "noodles"],
  [/curry|masala|tikka|korma|dal/i, "curry"], [/nasi|rendang|rijst|rice/i, "nasi"], [/roti/i, "roti"], [/broodje|sandwich|tosti|panini|bagel|club/i, "sandwich"], [/steak|biefstuk|spare ?ribs|ribs|grill/i, "steak"],
  [/taco|burrito|nacho|quesadilla/i, "taco"], [/salade|salad|bowl/i, "salad"], [/falafel|hummus|mezze/i, "falafel"], [/souvlaki|griekse|greek|tzatziki/i, "mezze"], [/tajine|tagine|couscous/i, "tagine"],
  [/pannenkoek|pancake|poffertjes/i, "pancake"], [/bibimbap|bulgogi|kimchi/i, "bibimbap"], [/pad thai|thai/i, "thai"], [/pho|bun bo|banh/i, "pho"], [/pok[ée]/i, "poke"], [/vis|fish|kibbeling|lekkerbek/i, "fish"],
  [/tapas|patatas|croquetas/i, "tapas"], [/pierog/i, "pierogi"], [/dumpling|dim sum|gyoza|wonton/i, "dumplings"], [/croissant|quiche/i, "croissant"], [/ijs|dessert|taart|cake|tiramisu|brownie|wafel/i, "dessert"]];
const { data: rs } = await sb.from("restaurants").select("id, cuisine, image_url").eq("is_test", true);
let nr = 0, nm = 0;
for (const r of rs) {
  const k = CUISINE[(r.cuisine ?? "").toLowerCase()] ?? "plate";
  if (!r.image_url || r.image_url.includes("/library/")) { await sb.from("restaurants").update({ image_url: base + k + ".webp", image_credit: credit(k) }).eq("id", r.id); nr++; }
  const { data: items } = await sb.from("menu_items").select("id, name, image_url").eq("restaurant_id", r.id);
  for (const m of items ?? []) {
    if (m.image_url && !m.image_url.includes("/library/")) continue; // keep photos the restaurant uploaded itself
    const dk = DISH.find(([re]) => re.test(m.name))?.[1];
    // no dish match: leave empty so the UI shows the branded placeholder (better than a wrong dish)
    await sb.from("menu_items").update({ image_url: dk ? base + dk + ".webp" : null, image_credit: dk ? credit(dk) : null }).eq("id", m.id); if (dk) nm++;
  }
}
console.log(`library ${Object.keys(credits).length} images · ${nr} test restaurants · ${nm} test dishes with a matching photo`);
