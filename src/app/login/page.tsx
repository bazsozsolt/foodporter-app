"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/Toaster";
import { Button, Header } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { actions, useStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { signedIn } = useStore();
  const [email, setEmail] = useState("");

  async function signIn(provider: "apple" | "google" | "email") {
    const sb = getSupabase();
    if (sb) {
      if (provider === "email") {
        const { error } = await sb.auth.signInWithOtp({ email });
        toast(error ? error.message : "Check your email for a login link");
      } else {
        await sb.auth.signInWithOAuth({ provider });
      }
      return;
    }
    actions.signIn(provider);
    toast(`Signed in with ${provider} (mock)`);
    const next = new URLSearchParams(window.location.search).get("next") || "/";
    router.push(next);
  }

  return (
    <>
      <Header />
      <main className="p-4">
        <h2 className="mb-1 text-lg font-bold">Welcome 👋</h2>
        <p className="mb-3 text-sm text-muted">Order from Tilburg&apos;s favourite local spots. Riders bid to bring it to you fast.</p>
        {signedIn ? (
          <><p className="text-sm">Signed in ({signedIn}).</p><Button variant="ghost" onClick={actions.signOut}>Sign out</Button></>
        ) : (
          <>
            <Button variant="dark" onClick={() => signIn("apple")}> Continue with Apple</Button>
            <Button variant="ghost" onClick={() => signIn("google")}><span className="text-[#4285f4]">G</span> Continue with Google</Button>
            <input className="mt-4 w-full rounded-xl border-[1.5px] border-[#e2ded8] p-3" placeholder="you@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Button variant="ghost" onClick={() => signIn("email")}>✉️ Continue with email</Button>
            <p className="mt-3 text-center text-[13px] text-muted">Facebook login coming later</p>
          </>
        )}
      </main>
    </>
  );
}
