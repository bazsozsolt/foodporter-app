"use client";
import { useRouter } from "next/navigation";
import { toast } from "./Toaster";
import { actions } from "@/lib/store";

export function ReorderButton({ id, className }: { id: string; className?: string }) {
  const router = useRouter();
  return (
    <button data-testid="reorder" className={className ?? "mt-2.5 w-full rounded-2xl border-[1.5px] border-[#e2ded8] bg-white py-3 font-bold"}
      onClick={(e) => {
        e.preventDefault();
        try {
          const skipped = actions.reorder(id);
          toast(skipped ? `Added to cart · ${skipped} item(s) no longer available` : "Added to your cart");
          router.push("/cart");
        } catch (err) { toast("⚠️ " + (err as Error).message); }
      }}>🔁 Order again</button>
  );
}
