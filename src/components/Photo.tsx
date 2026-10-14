"use client";
import { useState } from "react";

/** Fixed-aspect, lazy-loaded photo with a branded placeholder (no layout shift: the box has its size before the image loads). */
export function Photo({ src, alt, emoji = "🍽️", className = "", ratio = "4/3", eager = false, sizes }: { src?: string | null; alt: string; emoji?: string; className?: string; ratio?: string; eager?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  const show = !!src && !failed;
  return (
    <div className={`relative overflow-hidden bg-[#9b0708] ${className}`} style={{ aspectRatio: ratio }} data-testid={show ? "photo" : "photo-placeholder"}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt={alt} width={640} height={480} sizes={sizes} loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={eager ? "high" : "low"}
          onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 grid place-items-center" style={{ background: "radial-gradient(circle at 30% 25%, #c3191a 0%, #9b0708 55%, #6e0405 100%)" }}>
          <span className="text-[2.2em] leading-none drop-shadow">{emoji}</span>
          <span className="absolute bottom-1 right-1.5 font-[Bebas_Neue,sans-serif] text-[10px] tracking-wider text-[#fad228] opacity-90">FOOD PORTER</span>
        </div>
      )}
    </div>
  );
}

/** Short credit: “by X, CC BY 2.0” from the stored attribution. */
export const shortCredit = (c?: string | null) => (c ? c.split(" · ")[0] : "");
