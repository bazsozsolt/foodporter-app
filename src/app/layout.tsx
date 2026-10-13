import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RoleNav } from "@/components/RoleNav";
import { Toaster } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "Food Porter",
  description: "Local food delivery in Tilburg. Riders bid to bring it fast.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ff5a1f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div className="relative mx-auto min-h-screen max-w-[420px] bg-paper pb-24 shadow-2xl">
          {children}
          <RoleNav />
          <Toaster />
        </div>
      </body>
    </html>
  );
}
