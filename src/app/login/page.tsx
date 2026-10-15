"use client";
import { Mail } from "lucide-react";
import { tx } from "@/lib/i18n";
import { T } from "@/components/LangToggle";
import { Footer } from "@/components/Footer";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { hasSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signedIn, profile, ready } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<{ google?: boolean; apple?: boolean }>({});
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!hasSupabase || !url || !key) return;
    fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } }).then((r) => r.json()).then((d) => setProviders({ google: !!d?.external?.google, apple: !!d?.external?.apple })).catch(() => {});
  }, []);
  const input = "mb-2 w-full rounded-xl border border-line p-3";

  const goNext = () => router.push(new URLSearchParams(window.location.search).get("next") || "/");

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
          <Button variant="ghost" onClick={() => void actions.signOut()}>{tx("Uitloggen", "Sign out")}</Button>
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
          <input className={input} placeholder={tx("Wachtwoord", "Password")} aria-label={tx("Wachtwoord", "Password")} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button disabled={busy || !email} onClick={() => go(actions.signInWithPassword(email, password), afterAuth)}><T nl="Inloggen" en="Sign in" /></Button>
          <Button variant="ghost" disabled={busy || !email || password.length < 6} onClick={() => go(actions.signUp(email, password), afterAuth)}>{tx("Account aanmaken", "Create account")}</Button>
          <button className="mt-3 w-full text-center text-sm font-semibold text-brand disabled:opacity-50" disabled={busy || !email} onClick={() => go(actions.magicLink(email), afterAuth)}>
            <Mail size={16} className="mr-1.5 inline" aria-hidden />{tx("Stuur me liever een inloglink", "Email me a magic link instead")}
          </button>
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
