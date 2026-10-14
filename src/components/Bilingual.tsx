"use client";
import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";

/** Renders the Dutch or English block for longer texts (legal pages). */
export function Bilingual({ nl, en }: { nl: ReactNode; en: ReactNode }) {
  return <>{useLang() === "en" ? en : nl}</>;
}
