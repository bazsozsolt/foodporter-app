"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Header } from "@/components/ui";
import { act } from "@/lib/act";
import { hasSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signedIn, profile } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const input = "mb-2 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-3";

  const goNext = () => router.push(new URLSearchParams(window.location.search).get("next") || "/");

  async function go(p: Promise<string>, then?: (msg: string) => void) {
    setBusy(true);
    const msg = await act(p, (m) => m);
    setBusy(false);
    if (msg) then?.(msg);
  }
  const afterAuth = (m: string) => { if (!m.startsWith("Check")) goNext(); };

  if (signedIn) {
    return (
      <>
        <Header />
        <main className="p-4">
          <Card>
            <p className="font-bold">Signed in</p>
            <p className="text-sm text-muted">{signedIn}{profile ? ` · role: ${profile.role}` : ""}</p>
          </Card>
          <Button variant="ghost" onClick={() => void actions.signOut()}>Sign out</Button>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="p-4">
        <h2 className="mb-1 text-lg font-bold">Welcome 👋</h2>
        <p className="mb-3 text-sm text-muted">Order from Tilburg&apos;s favourite local spots. Riders bid to bring it to you fast.</p>
        <Card>
          <input className={input} placeholder="you@example.com" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button disabled={busy || !email} onClick={() => go(actions.signInWithPassword(email, password), afterAuth)}>Sign in</Button>
          <Button variant="ghost" disabled={busy || !email || password.length < 6} onClick={() => go(actions.signUp(email, password), afterAuth)}>Create account</Button>
          <button className="mt-3 w-full text-center text-sm font-semibold text-brand disabled:opacity-50" disabled={busy || !email} onClick={() => go(actions.magicLink(email), afterAuth)}>
            ✉️ Email me a magic link instead
          </button>
        </Card>
        <div className="my-3 text-center text-xs text-muted">or</div>
        <Button variant="dark" disabled={busy} onClick={() => go(actions.oauth("apple"), afterAuth)}> Continue with Apple</Button>
        <Button variant="ghost" disabled={busy} onClick={() => go(actions.oauth("google"), afterAuth)}><span className="text-[#4285f4]">G</span> Continue with Google</Button>
        <p className="mt-3 text-center text-[13px] text-muted">
          {hasSupabase ? "Google/Apple need to be enabled in Supabase Auth first. " : "Mock sign-in (no Supabase keys). "}Facebook login coming later.
        </p>
      </main>
    </>
  );
}
