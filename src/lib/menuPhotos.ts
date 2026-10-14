"use client";
import { getSupabase } from "@/lib/supabase";
import { tx } from "@/lib/i18n";

/** Resize + compress on the phone: longest side `max` px, WebP (JPEG fallback on browsers that can't encode WebP). */
export async function toWebp(file: File, max = 1280, quality = 0.78): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  if (!/^image\//.test(file.type) && file.type !== "") throw new Error(tx("Alleen foto's (JPG, PNG, WEBP, HEIC)", "Photos only (JPG, PNG, WEBP, HEIC)"));
  if (file.size > 25 * 1024 * 1024) throw new Error(tx("Foto is te groot (max 25 MB voor verkleinen)", "Photo is too large (max 25 MB before resizing)"));
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(tx("Deze foto kan niet gelezen worden, kies een JPG of PNG", "This photo can't be read, choose a JPG or PNG")); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const enc = (type: string) => new Promise<Blob | null>((res) => c.toBlob(res, type, quality));
  const webp = await enc("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpg = await enc("image/jpeg");
  if (!jpg) throw new Error(tx("Foto verwerken mislukt", "Could not process the photo"));
  return { blob: jpg, ext: "jpg" };
}

/** Upload a restaurant cover/logo or a dish photo; the server checks ownership and stores the public URL. */
export async function uploadMenuPhoto(target: { restaurantId: string; kind: "cover" | "logo" } | { restaurantId: string; itemId: string }, file: File) {
  const sb = getSupabase(); if (!sb) throw new Error("offline");
  const isItem = "itemId" in target;
  const { blob, ext } = await toWebp(file, isItem ? 960 : 1600);
  if (blob.size > 1.5 * 1024 * 1024) throw new Error(tx("Foto is na verkleinen nog te groot (max 1,5 MB)", "Photo is still too large after resizing (max 1.5 MB)"));
  const path = `${target.restaurantId}/${isItem ? "item" : target.kind}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}.${ext}`;
  const up = await sb.storage.from("menu-photos").upload(path, blob, { contentType: ext === "webp" ? "image/webp" : "image/jpeg", cacheControl: "31536000" });
  if (up.error) throw new Error(up.error.message);
  const r = isItem ? await sb.rpc("set_menu_item_image", { p_item: target.itemId, p_path: path }) : await sb.rpc("set_restaurant_image", { p_restaurant: target.restaurantId, p_kind: target.kind, p_path: path });
  if (r.error) { void sb.storage.from("menu-photos").remove([path]); throw new Error(r.error.message); }
  return r.data as string;
}
