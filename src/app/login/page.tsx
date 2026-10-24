"use client";
import { Mail } from "lucide-react";
import { tx } from "@/lib/i18n";
import { T } from "@/components/LangToggle";
import { Footer } from "@/components/Footer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { hasSupabase } from "@/lib/supabase";
import { actions, passwordProblem, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signedIn, profile, ready } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"main" | "forgot" | "forgotEmail">("main");
  const [reset, setReset] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reset") === "1");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [curPw, setCurPw] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null); // "check your email" screen after sign-up
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [providers, setProviders] = useState<{ google?: boolean; apple?: boolean }>({});
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!hasSupabase || !url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }).then((r) => r.json()).then((d) => setProviders({ google: !!d?.external?.google, apple: !!d?.external?.apple })).catch(() => {});
  }, []);
  const input = "mb-2 w-full rounded-xl border border-line p-3";

  // Only same-app paths are allowed as "next" (no open redirect).
  const goNext = () => { const n = new URLSearchParams(window.location.search).get("next") || "/"; router.push(n.startsWith("/") && !n.startsWith("//") ? n : "/"); };
  const newPwProblem = newPw ? passwordProblem(newPw) : null;
  const pwOk = !passwordProblem(newPw) && newPw === newPw2 && (reset || curPw.length > 0);
  const newPwForm = (
    <Card>
      <p className="mb-2 font-bold">{tx("Kies een nieuw wachtwoord", "Choose a new password")}</p>
      {!reset && <input data-testid="current-password" className={input} placeholder={tx("Huidig wachtwoord", "Current password")} aria-label={tx("Huidig wachtwoord", "Current password")} type="password" autoComplete="current-password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />}
      <input data-testid="new-password" className={input} placeholder={tx("Nieuw wachtwoord", "New password")} aria-label={tx("Nieuw wachtwoord", "New password")} type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      <input className={input} placeholder={tx("Herhaal wachtwoord", "Repeat password")} aria-label={tx("Herhaal wachtwoord", "Repeat password")} type="password" autoComplete="new-password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
      {newPwProblem && <p className="mb-2 text-xs text-muted">{newPwProblem}</p>}
      {newPw2 && newPw !== newPw2 && <p className="mb-2 text-sm text-[#c40000]">{tx("De wachtwoorden zijn niet gelijk.", "Passwords don't match.")}</p>}
      <Button disabled={busy || !pwOk} onClick={() => go(actions.updatePassword(newPw, reset ? undefined : curPw), () => { setNewPw(""); setNewPw2(""); setCurPw(""); if (reset) { setReset(false); window.history.replaceState(null, "", window.location.pathname); } })}>{tx("Wachtwoord opslaan", "Save password")}</Button>
    </Card>
  );

  async function go(p: Promise<string>, then?: (msg: string) => void) {
    setBusy(true);
    const msg = await act(p, (m) => m);
    setBusy(false);
    if (msg) then?.(msg);
  }
  const afterAuth = (m: string) => { if (!m.startsWith("✉️")) goNext(); };

  if (!ready) return <><Header /><p className="p-6 text-center text-muted">{tx("Laden…", "Loading…")}</p></>;

  if (signedIn) {
    return (
      <>
        <Header />
        <main id="main" className="p-4">
          <Card>
            <p className="font-bold">{tx("Ingelogd", "Signed in")}</p>
            <p className="text-sm text-muted">{signedIn}{profile ? ` · role: ${profile.role}` : ""}</p>
          </Card>
          {reset ? newPwForm : <details className="mb-3 rounded-xl border border-line p-3"><summary className="cursor-pointer font-semibold">{tx("Wachtwoord wijzigen", "Change password")}</summary><div className="mt-2">{newPwForm}</div></details>}
          <Link href="/privacy#rights" className="mb-3 block text-sm font-semibold text-brand">{tx("Mijn gegevens downloaden of account verwijderen", "Download my data or delete my account")}</Link>
          <Button data-testid="sign-out" variant="ghost" onClick={() => void actions.signOut()}>{tx("Uitloggen", "Sign out")}</Button>
        </main>
      </>
    );
  }

  if (sentTo) {
    return (
      <>
        <Header />
        <main id="main" className="p-4">
          <Card>
            <div data-testid="check-email" className="text-center">
              <Mail size={40} className="mx-auto mb-2 text-brand" aria-hidden />
              <h2 className="mb-1 text-lg font-bold">{tx("Kijk in je e-mail", "Check your email")}</h2>
              <p className="mb-1 text-sm">{tx("We hebben een bevestigingslink gestuurd naar", "We've sent a confirmation link to")} <b className="break-all">{sentTo}</b>.</p>
              <p className="mb-3 text-sm text-muted">{tx("Klik op de link om je account te activeren; daarna ben je meteen ingelogd. Niets ontvangen? Kijk in je spammap of stuur hem opnieuw.", "Click the link to activate your account; you'll be signed in right away. Nothing arrived? Check your spam folder or send it again.")}</p>
            </div>
            <Button data-testid="resend-confirmation" variant="ghost" disabled={busy} onClick={() => go(actions.resendConfirmation(sentTo))}>{tx("Stuur de link opnieuw", "Resend the link")}</Button>
            <button className="mt-3 w-full text-center text-sm font-semibold text-brand" onClick={() => { setSentTo(null); setMode("main"); }}>{tx("Terug naar inloggen", "Back to sign in")}</button>
          </Card>
          <Footer />
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <h2 className="mb-1 text-lg font-bold">{tx("Welkom", "Welcome")}</h2>
        <p className="mb-3 text-sm text-muted">{tx("Bestel bij de favoriete lokale zaken van Tilburg. Riders bieden om het snel bij je te brengen.", "Order from Tilburg’s favourite local spots. Riders bid to bring it to you fast.")}</p>
        <Card>
          <input className={input} placeholder={tx("jij@voorbeeld.nl", "you@example.com")} aria-label={tx("E-mailadres", "Email address")} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {mode === "main" && <><input className={input} placeholder={tx("Wachtwoord", "Password")} aria-label={tx("Wachtwoord", "Password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button disabled={busy || !email || !password} onClick={() => { setUnconfirmed(false); go(actions.signInWithPassword(email, password).catch((e: Error) => { if (/bevestig eerst|confirm your email/i.test(e.message)) setUnconfirmed(true); throw e; }), afterAuth); }}><T nl="Inloggen" en="Sign in" /></Button>
          <Button variant="ghost" disabled={busy || !email || !!passwordProblem(password)} onClick={() => go(actions.signUp(email, password), (m) => { if (m.startsWith("✉️")) { setSentTo(email.trim()); setPassword(""); } else goNext(); })}>{tx("Account aanmaken", "Create account")}</Button>
          {unconfirmed && <div data-testid="unconfirmed" className="mb-2 rounded-xl border border-gold bg-gold-soft p-3 text-sm">
            <p className="mb-2">{tx("Je e-mailadres is nog niet bevestigd. Open de link in de e-mail die we je stuurden (kijk ook in spam).", "Your email address isn't confirmed yet. Open the link in the email we sent you (check spam too).")}</p>
            <button data-testid="resend-confirmation" className="font-semibold text-brand disabled:opacity-50" disabled={busy} onClick={() => go(actions.resendConfirmation(email))}>{tx("Stuur de bevestigingsmail opnieuw", "Resend confirmation email")}</button>
          </div>}
          {password.length > 0 && passwordProblem(password) && <p className="mb-2 text-xs text-muted">{tx("Nieuw account: ", "New account: ")}{passwordProblem(password)}</p>}
          <button className="mt-3 w-full text-center text-sm font-semibold text-brand disabled:opacity-50" disabled={busy || !email} onClick={() => go(actions.magicLink(email), afterAuth)}>
            <Mail size={16} className="mr-1.5 inline" aria-hidden />{tx("Stuur me liever een inloglink", "Email me a magic link instead")}
          </button>
          <div className="mt-3 flex justify-between text-sm">
            <button data-testid="forgot-password" className="font-semibold text-brand" onClick={() => setMode("forgot")}>{tx("Wachtwoord vergeten?", "Forgot password?")}</button>
            <button data-testid="forgot-email" className="font-semibold text-brand" onClick={() => setMode("forgotEmail")}>{tx("E-mailadres vergeten?", "Forgot your email?")}</button>
          </div></>}
          {mode === "forgot" && <>
            <p className="mb-2 text-sm text-muted">{tx("Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord te kiezen.", "Enter your email. We'll send you a link to choose a new password.")}</p>
            <Button data-testid="send-reset" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => go(actions.resetPassword(email))}>{tx("Stuur herstellink", "Send reset link")}</Button>
            <button className="mt-3 w-full text-center text-sm font-semibold text-brand" onClick={() => setMode("main")}>{tx("Terug naar inloggen", "Back to sign in")}</button>
          </>}
          {mode === "forgotEmail" && <>
            <p className="mb-2 text-sm">{tx("Je gebruikersnaam is het e-mailadres waarmee je je aanmeldde. Om privacyredenen tonen we niet of een adres bij ons bekend is. Probeer dit:", "Your user ID is the email address you signed up with. For privacy we never show whether an address has an account. Try this:")}</p>
            <ul className="mb-2 list-disc pl-5 text-sm text-muted">
              <li>{tx("Zoek in je mailboxen naar ‘Food Porter’ (ook in spam): daar staat het adres waarop je mail van ons kreeg.", "Search your mailboxes for ‘Food Porter’ (spam too): our emails show which address you used.")}</li>
              <li>{tx("Vul een adres in en kies ‘Wachtwoord vergeten?’: alleen als er een account is, komt er een mail aan.", "Enter an address and use ‘Forgot password?’: only if there is an account will an email arrive.")}</li>
              <li>{tx("Rider of restaurant? Je account is aangemaakt met het adres dat je aan Food Porter gaf. Lukt het niet, neem contact op via privacy@foodporter.nl; we checken eerst wie je bent.", "Rider or restaurant? Your account uses the address you gave Food Porter. Still stuck? Contact privacy@foodporter.nl; we verify who you are first.")}</li>
            </ul>
            <button className="mt-1 w-full text-center text-sm font-semibold text-brand" onClick={() => setMode("main")}>{tx("Terug naar inloggen", "Back to sign in")}</button>
          </>}
        </Card>
        {/* Only show social logins that are actually enabled in Supabase Auth (they returned a 400 error page before). */}
        {(providers.apple || providers.google) && <div className="my-3 text-center text-xs text-muted">{tx("of", "or")}</div>}
        {providers.apple && <Button variant="dark" disabled={busy} onClick={() => go(actions.oauth("apple"), afterAuth)}> {tx("Doorgaan met Apple", "Continue with Apple")}</Button>}
        {providers.google && <Button variant="ghost" disabled={busy} onClick={() => go(actions.oauth("google"), afterAuth)}><span className="text-[#4285f4]">G</span> {tx("Doorgaan met Google", "Continue with Google")}</Button>}
        <p className="mt-3 text-center text-[13px] text-muted">
          {hasSupabase ? "" : tx("Demo-inlog (geen Supabase-sleutels). ", "Mock sign-in (no Supabase keys). ")}{tx("Inloggen met Google, Apple of Facebook volgt later.", "Google, Apple and Facebook login coming later.")}
        </p>
      <Footer />
      </main>
    </>
  );
}
