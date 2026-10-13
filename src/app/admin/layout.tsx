"use client";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin";
import { RoleGate } from "@/components/RoleGate";
import { Card, Header } from "@/components/ui";
import { hasSupabase } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header subtitle="Admin back office" />
      <main className="p-4">
        <RoleGate role="admin">
          {!hasSupabase ? (
            <Card className="text-center text-sm text-muted">The admin back office needs Supabase. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</Card>
          ) : (
            <>
              <AdminNav />
              {children}
            </>
          )}
        </RoleGate>
      </main>
    </>
  );
}
