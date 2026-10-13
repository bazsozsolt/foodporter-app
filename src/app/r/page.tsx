"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MenuView } from "./[id]/MenuView";

// Canonical menu URL /r?id=<uuid>: works in the static export for restaurants added after the build.
function Inner() { return <MenuView id={useSearchParams().get("id") ?? ""} />; }
export default function Page() { return <Suspense fallback={null}><Inner /></Suspense>; }
