import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Bebas_Neue } from "next/font/google";
import { RoleNav } from "@/components/RoleNav";
import { Toaster } from "@/components/Toaster";
import { AppShell } from "@/components/AppShell";
import { FeedbackButton } from "@/components/FeedbackButton";
import { TestModeBanner } from "@/components/TestModeBanner";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-bebas", display: "swap" });

export const metadata: Metadata = {
  title: "Food Porter · Tilburg",
  description: "Sneller je avondeten bezorgd in Tilburg, door lokale riders die zelf hun tempo kiezen.",
  icons: { icon: [{ url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icons/icon-192.png`, sizes: "192x192", type: "image/png" }], apple: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icons/apple-touch-icon.png` },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9b0708" };

const SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next.js static export uses inline bootstrap scripts
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  `connect-src 'self' ${SUPA} ${SUPA.replace(/^https/, "wss")} https://api.pdok.nl`,
  "font-src 'self' data:",
  "worker-src 'self'", "manifest-src 'self'",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-src 'none'",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={bebas.variable}>
      <head>
        {/* GitHub Pages cannot send HTTP headers, so the policy is set via meta (frame-ancestors/HSTS are not possible this way). */}
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body className="font-sans antialiased">
        <AppShell>
          <TestModeBanner />
          {children}
          <FeedbackButton />
          <RoleNav />
          <Toaster />
        </AppShell>
      </body>
    </html>
  );
}
