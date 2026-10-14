"use client";
import { tx } from "@/lib/i18n";

/** Attribution for licensed (CC BY / CC0) test photos shown on a page. */
export function PhotoCredits({ credits }: { credits: (string | null | undefined)[] }) {
  const list = [...new Set(credits.filter((c): c is string => !!c))];
  if (!list.length) return null;
  return (
    <details className="mt-3 text-[11px] text-muted" data-testid="photo-credits">
      <summary className="cursor-pointer">📷 {tx("Fotobronnen (voorbeeldfoto’s, geen foto’s van dit restaurant)", "Photo credits (example photos, not of this restaurant)")}</summary>
      <ul className="mt-1 space-y-0.5">
        {list.map((c) => { const [label, url] = c.split(" · "); return <li key={c}>{label}{url && <> · <a className="underline" href={url} target="_blank" rel="noreferrer nofollow">{tx("bron", "source")}</a></>}</li>; })}
      </ul>
    </details>
  );
}
