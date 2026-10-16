"use client";
import { useT } from "@/lib/i18n";
import Link from "next/link";
import { Empty, Header } from "@/components/ui";
import { ShoppingBag } from "lucide-react";
import { CartSummary, useCartLines } from "@/components/CartSummary";

export default function CartPage() {
  const t = useT();
  const { r, lines } = useCartLines();
  return (
    <>
      <Header />
      <main id="main" className="p-4">
        <h1 className="mb-3 text-[28px]">{t("Je winkelmand", "Your cart")}</h1>
        {!r || lines.length === 0 ? <Empty icon={<ShoppingBag size={26} />}>{t("Je winkelmand is leeg.", "Your cart is empty.")} <Link className="text-brand" href="/">{t("Bekijk restaurants", "Browse restaurants")}</Link></Empty> : <CartSummary />}
      </main>
    </>
  );
}
