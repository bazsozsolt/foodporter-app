// The 14 EU allergens (Regulation 1169/2011, Annex II). Codes match the DB check fp_valid_allergens.
export const ALLERGENS: [code: string, nl: string, en: string][] = [
  ["gluten", "Gluten", "Gluten"], ["crustaceans", "Schaaldieren", "Crustaceans"], ["eggs", "Eieren", "Eggs"], ["fish", "Vis", "Fish"],
  ["peanuts", "Pinda's", "Peanuts"], ["soy", "Soja", "Soy"], ["milk", "Melk", "Milk"], ["nuts", "Noten", "Tree nuts"],
  ["celery", "Selderij", "Celery"], ["mustard", "Mosterd", "Mustard"], ["sesame", "Sesam", "Sesame"], ["sulphites", "Sulfiet", "Sulphites"],
  ["lupin", "Lupine", "Lupin"], ["molluscs", "Weekdieren", "Molluscs"],
];
export const allergenLabel = (code: string, en: boolean) => { const a = ALLERGENS.find((x) => x[0] === code); return a ? (en ? a[2] : a[1]) : code; };
