"use client";
import { tx } from "@/lib/i18n";
import { RoleGate } from "@/components/RoleGate";
import { Header } from "@/components/ui";
import { useStore } from "@/lib/store";
import { RiderShifts } from "@/components/RiderShifts";

export default function RiderShiftsPage() {
  const { profile, mode } = useStore();
  return (
    <>
      <Header subtitle={tx("Rider · Diensten", "Rider · Shifts")} />
      <main id="main" className="p-4">
        <h1 className="mb-3 text-[28px]">{tx("Diensten", "Shifts")}</h1>
        <RoleGate role="rider">
          {mode === "supabase" && profile?.role === "rider" ? <RiderShifts riderId={profile.id} online={Boolean(profile.online)} /> : <p className="text-sm text-muted">{tx("Log in als rider om je diensten te zien.", "Sign in as a rider to see your shifts.")}</p>}
        </RoleGate>
      </main>
    </>
  );
}
