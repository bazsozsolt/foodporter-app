"use client";
import { toast } from "@/components/Toaster";
import { tx } from "@/lib/i18n";

/** Dutch versions of the error messages the server and auth send most often. */
const NL_ERRORS: [RegExp, string][] = [
  [/^please sign in( first)?$/i, "Log eerst in"], [/^please sign in as a rider$/i, "Log in als rider"],
  [/^invalid login credentials$/i, "Onjuist e-mailadres of wachtwoord"], [/^user already registered$/i, "Er bestaat al een account met dit e-mailadres"],
  [/^password should be at least (\d+) characters/i, "Het wachtwoord moet minstens $1 tekens hebben"],
  [/^order not found$/i, "Bestelling niet gevonden"], [/^restaurant not available$/i, "Restaurant niet beschikbaar"],
  [/^group( order)? not found$/i, "Groepsbestelling niet gevonden"], [/^this group order is locked$/i, "Deze groepsbestelling is vergrendeld"],
  [/^the deadline for this group order has passed$/i, "De deadline van deze groepsbestelling is voorbij"],
  [/^only the host can do this$/i, "Alleen de host kan dit doen"], [/^item not on this menu$/i, "Dit item staat niet op het menu"],
  [/^an item is no longer available$/i, "Een item is niet meer beschikbaar"], [/^the basket is empty$/i, "De mand is leeg"],
  [/^address or phone invalid$/i, "Adres of telefoonnummer ongeldig"], [/^invalid quantity$/i, "Ongeldig aantal"],
  [/^this group is full/i, "Deze groep is vol (25 personen)"], [/^item not found$/i, "Item niet gevonden"],
  [/^unlock the basket first$/i, "Open de mand eerst weer"], [/^this group order is already checked out$/i, "Deze groepsbestelling is al afgerekend"],
  [/^None of these items are available anymore$/i, "Geen van deze items is nog beschikbaar"],
  [/^not signed in$/i, "Je bent niet ingelogd"], [/^invalid photo$/i, "Foto kon niet worden gekoppeld, probeer opnieuw"], [/^offline$/i, "Geen verbinding. Probeer opnieuw."],
  [/^Failed to fetch$|NetworkError|Load failed/i, "Geen verbinding. Controleer je internet en probeer opnieuw."],
];
/** English versions of the Dutch messages the server raises (support, rate limit, chat, call). */
const EN_ERRORS: [RegExp, string][] = [
  [/^Te veel verzoeken/i, "Too many requests, please try again later"], [/^Onbekende categorie/i, "This category is not available for your account"],
  [/^Beschrijf het probleem/i, "Describe the problem in a few words"], [/^Bericht is te lang/i, "Message is too long (max 2000 characters)"],
  [/^Deze bestelling hoort niet bij jouw account/i, "This order does not belong to your account"], [/^Kies de bestelling/i, "Choose the order this is about"],
  [/^Terugbetaling kan alleen/i, "A refund is only possible for a paid order"], [/^Bedrag is hoger/i, "The amount is more than you paid"],
  [/^Je bent niet ingelogd/i, "You are not signed in"], [/^Foto kon niet/i, "The photo could not be attached, try again"],
  [/^Je account kan geen melding/i, "Your account cannot create a report"], [/^Chat is gesloten/i, "This chat is closed"],
  [/^Je hebt geen toegang tot deze chat/i, "You don't have access to this chat"], [/^Bellen kan alleen/i, "Calling is only possible during an active delivery"],
  [/^Geen telefoonnummer/i, "No phone number available"], [/^Bericht is leeg/i, "Message is empty"],
];
export function localizeError(msg: string) {
  if (tx("nl", "en") === "en") {
    if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "No connection. Check your internet and try again.";
    for (const [re, en] of EN_ERRORS) if (re.test(msg)) return en;
    return msg;
  }
  for (const [re, nl] of NL_ERRORS) { const m = msg.match(re); if (m) return nl.replace("$1", m[1] ?? ""); }
  return msg;
}

/** Run an async action and toast success or the error message. */
export async function act<T>(p: Promise<T>, ok?: string | ((v: T) => string)): Promise<T | undefined> {
  try {
    const v = await p;
    const msg = typeof ok === "function" ? ok(v) : ok;
    if (msg) toast(msg);
    return v;
  } catch (e) {
    toast("⚠️ " + localizeError(e instanceof Error ? e.message : String(e)));
    return undefined;
  }
}
