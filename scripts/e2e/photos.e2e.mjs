// v13: restaurant/menu photos. Public read, owner-only write, type/size limits, ownership checks in the RPCs.
import { client, login, ok, summary, SB_URL } from "./common.mjs";
const anon = client();
const admin = await login("ADMIN"), staff = await login("STAFF"), cust = await login("SIMC1");
const err = (r) => r.error?.message ?? null;
const rid = (await staff.sb.from("profiles").select("restaurant_id").eq("id", staff.id).single()).data.restaurant_id;
const other = (await admin.sb.from("restaurants").select("id").neq("id", rid).eq("is_test", true).limit(1).single()).data.id;
const item = (await admin.sb.from("menu_items").select("id, image_url").eq("restaurant_id", rid).limit(1).single()).data;
const foreignItem = (await admin.sb.from("menu_items").select("id").eq("restaurant_id", other).limit(1).single()).data;
// 1x1 WebP
const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const tag = Date.now().toString(36);
const p1 = `${rid}/item-e2e${tag}.webp`;
ok("restaurant uploads a WebP into its own folder", !err(await staff.sb.storage.from("menu-photos").upload(p1, webp, { contentType: "image/webp" })));
ok("upload into another restaurant's folder is blocked", !!err(await staff.sb.storage.from("menu-photos").upload(`${other}/item-e2e${tag}.webp`, webp, { contentType: "image/webp" })));
ok("customer cannot upload menu photos", !!err(await cust.sb.storage.from("menu-photos").upload(`${rid}/item-c${tag}.webp`, webp, { contentType: "image/webp" })));
ok("anon cannot upload", !!err(await anon.storage.from("menu-photos").upload(`${rid}/item-a${tag}.webp`, webp, { contentType: "image/webp" })));
ok("SVG/HTML is rejected by the bucket", !!err(await staff.sb.storage.from("menu-photos").upload(`${rid}/item-s${tag}.webp`, Buffer.from("<svg onload=alert(1)>"), { contentType: "image/svg+xml" })));
ok("files over 1.5 MB are rejected", !!err(await staff.sb.storage.from("menu-photos").upload(`${rid}/item-big${tag}.webp`, Buffer.alloc(1600000, 1), { contentType: "image/webp" })));
const set = await staff.sb.rpc("set_menu_item_image", { p_item: item.id, p_path: p1 });
ok("restaurant links the photo to its own dish", typeof set.data === "string" && set.data.endsWith(p1), err(set));
ok("public URL is readable without login", (await fetch(`${SB_URL}/storage/v1/object/public/menu-photos/${p1}`)).status === 200);
ok("linking to another restaurant's dish is refused", !!err(await staff.sb.rpc("set_menu_item_image", { p_item: foreignItem.id, p_path: p1 })));
ok("linking a path outside own folder is refused", !!err(await staff.sb.rpc("set_menu_item_image", { p_item: item.id, p_path: `${other}/item-x${tag}.webp` })));
ok("customer cannot set a cover", !!err(await cust.sb.rpc("set_restaurant_image", { p_restaurant: rid, p_kind: "cover", p_path: p1.replace("item-", "cover-") })));
const lib = await anon.from("restaurants").select("image_url, image_credit").eq("is_test", true).not("image_url", "is", null).limit(1).single();
ok("test restaurants have a licensed library image with attribution", /\/library\//.test(lib.data?.image_url ?? "") && /CC/.test(lib.data?.image_credit ?? ""), JSON.stringify(lib.data));
ok("real (non-test) restaurants were not given test images", ((await anon.from("restaurants").select("id").eq("is_test", false).like("image_url", "%/library/%")).data ?? []).length === 0);
// restore the dish's previous image and clean up
await admin.sb.from("menu_items").update({ image_url: item.image_url }).eq("id", item.id);
await staff.sb.storage.from("menu-photos").remove([p1]);
process.exit(summary() ? 1 : 0);
