"use client";
// v17 P4: photo proof of delivery. Private bucket "delivery-proof", path <order_id>/<random>.jpg, viewed via short-lived signed URLs.
import { useEffect, useRef, useState } from "react";
import { act } from "@/lib/act";
import { tx as txLang } from "@/lib/i18n";
import { getSupabase } from "@/lib/supabase";
import { shrink } from "@/lib/support";
import { actions } from "@/lib/store";
import { Camera, DoorOpen } from "lucide-react";

const pick = (en: boolean) => (nl: string, eng: string) => (en ? eng : txLang(nl, eng));

export function DeliveryPhoto({ path, english = false }: { path: string | null | undefined; english?: boolean }) {
  const tx = pick(english);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    void getSupabase()?.storage.from("delivery-proof").createSignedUrl(path, 600).then(({ data }) => { if (live) setUrl(data?.signedUrl ?? null); });
    return () => { live = false; };
  }, [path]);
  if (!path) return null;
  return (
    <figure className="mt-2" data-testid="delivery-photo">
      <figcaption className="mb-1 text-[13px] font-semibold">{tx("Foto bij aflevering", "Delivery photo")}</figcaption>
      {url ? <a href={url} target="_blank" rel="noreferrer noopener"><img src={url} alt={tx("Foto van de bestelling bij de deur", "Photo of the order at the door")} className="max-h-64 rounded-xl" /></a> : <span className="text-xs text-muted">{tx("Foto laden…", "Loading photo…")}</span>}
    </figure>
  );
}

export function LeaveAtDoorNote() {
  const tx = pick(false);
  return <p data-testid="leave-at-door-note" className="mt-2 flex items-center gap-2 rounded-xl bg-gold-soft p-2 text-[13px] font-semibold text-warn"><DoorOpen size={16} aria-hidden />{tx("Afleveren zonder contact: zet het bij de deur en maak een foto.", "Contactless: leave it at the door and take a photo.")}</p>;
}

/** Rider: take a photo at drop-off (required for leave-at-door orders before "Delivered"). */
export function ProofCapture({ orderId, hasPhoto }: { orderId: string; hasPhoto: boolean }) {
  const tx = pick(false);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    await act((async () => {
      const sb = getSupabase(); if (!sb) throw new Error("offline");
      if (!/^image\//.test(f.type) && f.type !== "") throw new Error(tx("Alleen foto's", "Photos only"));
      const blob = await shrink(f);
      if (blob.size > 8 * 1024 * 1024) throw new Error(tx("Foto is te groot (max 8 MB)", "Photo is too large (max 8 MB)"));
      const path = `${orderId}/${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}.jpg`;
      const up = await sb.storage.from("delivery-proof").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error(up.error.message);
      const { error } = await sb.rpc("order_set_delivery_photo", { p_order: Number(orderId), p_path: path });
      if (error) throw new Error(error.message);
      actions.reloadUser();
      return true;
    })(), tx("Foto opgeslagen", "Photo saved"));
    setBusy(false);
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" data-testid="proof-input" onChange={(e) => void onFile(e.target.files?.[0])} />
      <button type="button" data-testid="proof-button" data-persist disabled={busy} onClick={() => ref.current?.click()}
        className={`mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold ring-1 ${hasPhoto ? "bg-white text-ok ring-line" : "bg-ink text-white ring-ink"}`}>
        <Camera size={18} aria-hidden />{busy ? tx("Uploaden…", "Uploading…") : hasPhoto ? tx("Foto gemaakt · opnieuw", "Photo taken · retake") : tx("Maak foto bij de deur", "Take photo at the door")}
      </button>
    </>
  );
}
