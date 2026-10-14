"use client";
import { usePathname } from "next/navigation";

export const TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE !== "0";

/** Thin sticky banner on every customer/restaurant/rider screen while payments run in Mollie test mode. */
export function TestModeBanner() {
  const path = usePathname();
  if (!TEST_MODE || path.startsWith("/admin")) return null;
  return (
    <div data-testid="test-mode-banner" className="sticky top-0 z-30 bg-amber-300 px-3 py-1.5 text-center text-[12px] font-bold leading-tight text-ink print:hidden">
      🧪 TEST MODE: no real money. On the Mollie page choose <u>Paid</u>. Restaurants marked 🧪 are test data.
    </div>
  );
}

/** Bigger explanation for the checkout. */
export function TestModeCheckoutNote() {
  if (!TEST_MODE) return null;
  return (
    <div data-testid="test-mode-checkout" className="mb-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-3 text-sm">
      <b>🧪 TEST MODE: no real money is charged.</b>
      <ol className="mt-1 list-decimal pl-5 text-[13px]">
        <li>Tap <b>Pay</b>: you go to Mollie&apos;s test checkout.</li>
        <li>Choose <b>iDEAL</b> and any bank (or a card), then select the status <b>Paid</b> and continue.</li>
        <li>You come back here and can follow your (test) order.</li>
      </ol>
      <p className="mt-1 text-[12px] text-muted">Nobody will actually cook or deliver it. Choosing &quot;Failed&quot; or &quot;Expired&quot; is fine too if you want to test that.</p>
    </div>
  );
}
