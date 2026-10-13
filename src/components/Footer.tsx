import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-6 pb-4 text-center text-xs text-muted print:hidden">
      <div className="flex justify-center gap-3">
        <Link href="/welcome" className="underline">About</Link>
        <Link href="/terms" className="underline">Terms</Link>
        <Link href="/privacy" className="underline">Privacy</Link>
        <Link href="/cookies" className="underline">Cookies</Link>
      </div>
      <p className="mt-2">Food Porter · Tilburg pilot · © 2026</p>
    </footer>
  );
}
