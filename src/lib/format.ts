export const eur = (cents: number) => "€" + (cents / 100).toFixed(2).replace(".", ",");
export const hhmm = (d: Date) => d.toTimeString().slice(0, 5);
