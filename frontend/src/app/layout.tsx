// src/app/layout.tsx
// ─────────────────────────────────────────────────────────────
// Root layout for Sunway Express Lane (PayNet).
//
// Structure:
//   <html>
//     <body>
//       <CartProvider>      ← global cart state available everywhere
//         {children}        ← page content rendered by Next.js router
//         <CartSummary />   ← persistent floating cart widget
//       </CartProvider>
//     </body>
//   </html>
// ─────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartSummary from "@/components/CartSummary";

const inter = Inter({ subsets: ["latin"] });

/* ── Meta & viewport ───────────────────────────────────────── */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "Sunway Express Lane",
  description:
    "Browse campus food vendors, pre-order meals, and pay seamlessly with DuitNow — all from your phone.",
};

/* ── Layout component ──────────────────────────────────────── */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* CartProvider supplies cart state to every page & component */}
        <CartProvider>
          {children}
          {/* Floating cart summary — always visible at the bottom */}
          <CartSummary />
        </CartProvider>
      </body>
    </html>
  );
}
