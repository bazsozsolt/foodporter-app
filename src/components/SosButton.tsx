"use client";
import { useState } from "react";
import { tx } from "@/lib/i18n";
import { createTicket } from "@/lib/support";

/**
 * Rider SOS: one tap, confirm, then (1) an urgent ticket + ops alert with the rider's last position goes to admin and
 * (2) the phone dialer opens 112. The call never waits for the network: if the ticket fails, 112 still opens.
 */
export function SosButton({ lat, lng, orderId }: { lat?: number; lng?: number; orderId: string | number | null }) {
  const [sent, setSent] = useState(false);
  async function sos() {
    if (!confirm(tx("SOS: 112 bellen en Food Porter direct waarschuwen met je locatie?", "SOS: call 112 and alert Food Porter right away with your location?"))) return;
    const body = tx("SOS vanuit de rider-app", "SOS from the rider app") + (orderId ? ` (#${orderId})` : "");
    // Fresh GPS fix if we don't have one yet, but never longer than 3 s; the 112 call is started first.
    const pos = lat != null ? Promise.resolve({ lat, lng }) : new Promise<{ lat?: number; lng?: number }>((res) => {
      if (!navigator.geolocation) return res({});
      const t = setTimeout(() => res({}), 3000);
      navigator.geolocation.getCurrentPosition((p) => { clearTimeout(t); res({ lat: p.coords.latitude, lng: p.coords.longitude }); }, () => { clearTimeout(t); res({}); }, { enableHighAccuracy: true, timeout: 3000, maximumAge: 60000 });
    });
    (window as unknown as { __fpSos?: number }).__fpSos = 1;
    window.location.href = "tel:112";
    const at = await pos;
    await createTicket({ category: "sos", body, order: orderId ? Number(orderId) : null, lat: at.lat, lng: at.lng }).then(() => setSent(true)).catch(() => {});
  }
  return (
    <div className="mb-3 flex items-center gap-2">
      <button data-testid="sos" onClick={sos} className="rounded-xl bg-[#c40000] px-4 py-2.5 text-sm font-black tracking-wide text-white shadow">🚨 SOS · 112</button>
      <p className="text-[12px] text-muted">{sent ? tx("✓ Food Porter is gewaarschuwd", "✓ Food Porter has been alerted") : tx("Belt 112 en waarschuwt Food Porter met je locatie", "Calls 112 and alerts Food Porter with your location")}</p>
    </div>
  );
}
