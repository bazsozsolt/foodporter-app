"use client";
import { useState } from "react";
import { tx as txLang } from "@/lib/i18n";
import { act } from "@/lib/act";
import { uploadMenuPhoto } from "@/lib/menuPhotos";
import { actions, useStore } from "@/lib/store";
import { Photo } from "./Photo";

/** Admin screens stay English; elsewhere follow the app language. */
const pick = (en: boolean) => (nl: string, eng: string) => (en ? eng : txLang(nl, eng));

function Pick({ label, onFile, testid, english = false }: { label: string; onFile: (f: File) => Promise<unknown>; testid: string; english?: boolean }) {
  const tx = pick(english);
  const [busy, setBusy] = useState(false);
  return (
    <label className={`inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink ${busy ? "opacity-50" : ""}`}>
      {busy ? tx("Uploaden…", "Uploading…") : label}
      <input data-testid={testid} type="file" accept="image/*" className="hidden" disabled={busy}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); await onFile(f); setBusy(false); }} />
    </label>
  );
}

/** Restaurant (and admin) photo manager: cover, logo and a photo per dish. */
export function RestaurantPhotos({ restaurantId, english = false }: { restaurantId: string; english?: boolean }) {
  const tx = pick(english);
  const { restaurants, menuItems } = useStore();
  const r = restaurants.find((x) => x.id === restaurantId);
  const items = menuItems.filter((m) => m.restaurant_id === restaurantId);
  const up = (t: Parameters<typeof uploadMenuPhoto>[0]) => async (f: File) => { if (await act(uploadMenuPhoto(t, f), tx("Foto opgeslagen", "Photo saved")) !== undefined) actions.reloadCatalog(); };
  if (!r) return null;
  return (
    <details open className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-black/[.04]" data-testid="restaurant-photos">
      <summary className="cursor-pointer font-semibold">{tx("Foto's van je restaurant en menu", "Photos of your restaurant and menu")}</summary>
      <p className="mt-1 text-xs text-muted">{tx("Foto's worden op je telefoon verkleind en als WebP opgeslagen. Gebruik alleen eigen foto's.", "Photos are resized on your phone and stored as WebP. Only use your own photos.")}</p>
      <div className="mt-2 grid grid-cols-[96px_1fr] items-center gap-3">
        <Photo src={r.image_url} alt={r.name} className="rounded-xl" sizes="96px" />
        <div className="flex flex-wrap gap-2"><Pick english={english} testid="upload-cover" label={tx("Omslagfoto kiezen", "Choose cover photo")} onFile={up({ restaurantId, kind: "cover" })} /><Pick english={english} testid="upload-logo" label={tx("Logo kiezen", "Choose logo")} onFile={up({ restaurantId, kind: "logo" })} /></div>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((m) => (
          <li key={m.id} className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-sm">
            <Photo src={m.image_url} alt={m.name} className="rounded-lg text-sm" sizes="64px" /><span className="truncate">{m.name}</span>
            <Pick english={english} testid={`upload-item-${m.id}`} label={tx("Foto", "Photo")} onFile={up({ restaurantId, itemId: m.id })} />
          </li>
        ))}
      </ul>
    </details>
  );
}
