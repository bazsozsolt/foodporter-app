import { tx } from "./i18n";
export const eur = (cents: number) => "€" + (cents / 100).toFixed(2).replace(".", ",");
export const hhmm = (d: Date) => d.toTimeString().slice(0, 5);

/** Cuisine names are stored in English; show them in Dutch when the UI is Dutch. */
const CUISINE_NL: Record<string, string> = { "Dutch snacks": "Snackbar", Burgers: "Burgers", Chicken: "Kip", Chinese: "Chinees", Fish: "Vis", French: "Frans", Greek: "Grieks", Grill: "Grill", Indian: "Indiaas",
  Indonesian: "Indonesisch", International: "Internationaal", Italian: "Italiaans", Japanese: "Japans", Korean: "Koreaans", Mediterranean: "Mediterraans", Mexican: "Mexicaans", Moroccan: "Marokkaans",
  Pancake: "Pannenkoeken", Polish: "Pools", Sandwiches: "Broodjes", Surinamese: "Surinaams", Thai: "Thais", Turkish: "Turks", Vietnamese: "Vietnamees", Afghan: "Afghaans", Hawaiian: "Hawaïaans",
  Asian: "Aziatisch", Steakhouse: "Steakhouse", "Wood-fired pizza": "Houtovenpizza", Lunch: "Lunch", Restaurant: "Restaurant", Pizza: "Pizza", Sushi: "Sushi", Kebab: "Kebab", Shawarma: "Shoarma", Shoarma: "Shoarma", Tapas: "Tapas", Javaans: "Javaans" };
export const cuisineLabel = (c?: string | null) => (c ? tx(CUISINE_NL[c] ?? c, c) : "");
