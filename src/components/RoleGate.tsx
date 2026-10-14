"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { canUse, useStore } from "@/lib/store";
import type { Role } from "@/lib/types";
import { useT } from "@/lib/i18n";

/** In Supabase mode, only users with the right role (or admin) see a screen. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const s = useStore();
  const t = useT();
  if (!s.ready) return <p className="p-6 text-center text-muted">{t("Laden…", "Loading…")}</p>;
  if (canUse(s, role)) return <>{children}</>;
  return (
    <Card className="text-center">
      <p className="mb-2 font-bold">{s.signedIn ? t(`Dit scherm is voor ${role}-accounts`, `This screen is for ${role} accounts`) : t("Log eerst in", "Please sign in")}</p>
      <p className="text-sm text-muted">{s.signedIn ? t(`Je bent ingelogd als ${s.profile?.role}. Vraag een admin om je account de rol ${role} te geven.`, `You are signed in as ${s.profile?.role}. Ask an admin to give your account the ${role} role.`) : t(`Log in met een ${role}-account om verder te gaan.`, `Sign in with ${role === "admin" ? "an" : "a"} ${role} account to continue.`)}</p>
      {!s.signedIn && <Link href="/login" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-bold text-white">{t("Inloggen", "Sign in")}</Link>}
    </Card>
  );
}
