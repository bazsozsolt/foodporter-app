"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { canUse, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";

/** In Supabase mode, only users with the right role (or admin) see a screen. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const s = useStore();
  if (!s.ready) return <p className="p-6 text-center text-muted">Loading…</p>;
  if (canUse(s, role)) return <>{children}</>;
  return (
    <Card className="text-center">
      <p className="mb-2 font-bold">{s.signedIn ? `This screen is for ${role} accounts` : "Please sign in"}</p>
      <p className="text-sm text-muted">{s.signedIn ? `You are signed in as ${s.profile?.role}. Ask an admin to give your account the ${role} role.` : `Sign in with ${role === "admin" ? "an" : "a"} ${role} account to continue.`}</p>
      {!s.signedIn && <Link href="/login" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-bold text-white">Sign in</Link>}
    </Card>
  );
}
