"use client";
import { Suspense, type ReactNode } from "react";
import { AdminNav } from "@/components/admin";
import { RoleGate } from "@/components/RoleGate";
import { Card, Header } from "@/components/ui";
import { hasSupabase } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header subtitle="Admin back office" />
      <main className="p-4 lg:p-6">
        <RoleGate role="admin">
          <div className="lg:grid lg:grid-cols-[220px_1fr] lg:gap-6">
              <Suspense fallback={null}><AdminNav /></Suspense>
              <div className="min-w-0">
                {!hasSupabase && <Card className="mb-3 text-sm text-muted">Demo admin (mock data). The live back office needs Supabase.</Card>}
                {children}
              </div>
            </div>
        </RoleGate>
      </main>
    </>
  );
}
