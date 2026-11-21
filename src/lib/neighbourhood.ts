/** Public bid-board label: Dutch postcode + city + optional distance. Never a street or house number. */
export function neighbourhoodFromAddress(address: string | null | undefined, distanceKm?: number | null): string {
  const a = address ?? "";
  const pc = a.match(/\b([0-9]{4})(?:\s*[A-Za-z]{2})?\b/)?.[1];
  const cityMatch = a.match(/\b(Tilburg|Goirle|Berkel-Enschot|Udenhout|Breda|Waalwijk|Oisterwijk|Loon op Zand)\b/i);
  const city = cityMatch ? cityMatch[1].replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()) : "";
  let label = [pc, city].filter(Boolean).join(", ");
  if (!label) label = "Tilburg";
  if (distanceKm != null && Number.isFinite(distanceKm)) {
    label += ` · ${distanceKm.toFixed(1).replace(".", ",")} km`;
  }
  return label;
}

/** True when a rider must not see the delivery address or customer details. */
export function hideAddressFromRider(order: { status?: string; rider_id?: string | null }, viewerId?: string | null): boolean {
  if (!viewerId) return order.status === "accepted" && !order.rider_id;
  if (order.rider_id && order.rider_id === viewerId) return false;
  return order.status === "accepted" && !order.rider_id;
}
