"use client";
import { Heart } from "lucide-react";
import { tx } from "@/lib/i18n";
import { toggleFavourite, useFavourites } from "@/lib/favourites";
import { toast } from "@/components/Toaster";

export function FavButton({ id, name, className = "" }: { id: string; name: string; className?: string }) {
  const on = useFavourites().includes(id);
  return (
    <button type="button" data-testid="fav-btn" aria-pressed={on} aria-label={on ? tx(`${name} uit favorieten halen`, `Remove ${name} from favourites`) : tx(`${name} als favoriet bewaren`, `Save ${name} as favourite`)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); const now = toggleFavourite(id); toast(now ? tx("Bewaard bij favorieten", "Saved to favourites") : tx("Uit favorieten gehaald", "Removed from favourites")); }}
      className={`grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-[var(--shadow-card)] ${on ? "text-brand" : "text-ink"} ${className}`}>
      <Heart size={20} aria-hidden fill={on ? "currentColor" : "none"} />
    </button>
  );
}
