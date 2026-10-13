import Link from "next/link";
import { Footer } from "@/components/Footer";

export const metadata = { title: "Food Porter · Faster dinner delivery in Tilburg", description: "Faster dinner delivery in Tilburg, driven by local riders who choose their own speed." };

const Step = ({ n, t, d }: { n: string; t: string; d: string }) => (
  <div className="flex gap-3 rounded-2xl bg-white p-4 shadow-sm">
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand font-extrabold text-white">{n}</div>
    <div><b>{t}</b><p className="text-sm text-muted">{d}</p></div>
  </div>
);

export default function Welcome() {
  return (
    <main>
      <section className="bg-gradient-to-br from-brand to-[#ff8a3d] px-5 pb-10 pt-12 text-white">
        <div className="text-sm font-bold opacity-90">🛵 Food Porter · Tilburg</div>
        <h1 className="mt-3 text-[28px] font-extrabold leading-tight">Faster dinner delivery in Tilburg, driven by local riders who choose their own speed.</h1>
        <p className="mt-3 text-white/90">Order from the city&apos;s favourite independent kitchens. Riders bid the delivery time they can really make, and you see it before your food leaves.</p>
        <Link href="/" className="mt-5 inline-block rounded-2xl bg-white px-5 py-3 font-extrabold text-brand shadow">Order now →</Link>
        <p className="mt-3 text-xs text-white/80">Within 3 km of central Tilburg · Spoorzone, Piushaven, Heuvel, Korvel and around</p>
      </section>
      <section className="space-y-2.5 p-4">
        <h2 className="mt-2 text-lg font-bold">How it works</h2>
        <Step n="1" t="Pick a local spot" d="5–10 hand-picked Tilburg restaurants. Pay with iDEAL or card." />
        <Step n="2" t="Riders bid their time" d="Nearby riders offer an ETA. Usually within 3 minutes you know who’s coming and when." />
        <Step n="3" t="Track it to your door" d="Live status and SMS: accepted, on the way, delivered. Then rate your meal." />
      </section>
      <section className="grid gap-2.5 p-4 md:grid-cols-2">
        <div className="rounded-2xl bg-ink p-4 text-white">
          <b>🚲 Ride with us</b>
          <p className="mt-1 text-sm text-white/80">Choose your own speed: bid only on the orders you want. Keep 100% of the flat delivery fee, paid weekly.</p>
          <Link href="/login?next=/rider" className="mt-2 inline-block text-sm font-bold text-[#ffb08f] underline">Sign up as a rider →</Link>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <b>👩‍🍳 Partner restaurants</b>
          <p className="mt-1 text-sm text-muted">No listing fee and a simple 10–15% commission. Set your own prep time per order; we handle riders and payments.</p>
          <a href="mailto:partners@foodporter.nl" className="mt-2 inline-block text-sm font-bold text-brand underline">Become a partner →</a>
        </div>
      </section>
      <div className="px-4"><Footer /></div>
    </main>
  );
}
