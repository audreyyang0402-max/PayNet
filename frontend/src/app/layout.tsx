// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import CartSummary from "@/components/CartSummary"; // <-- 1. Added this import

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Sunway Express Lane",
  description: "Preorder your campus meals and skip the queue.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CartProvider>
          {children}
          <CartSummary /> {/* <-- 2. Added the floating cart here */}
        </CartProvider>
      </body>
    </html>
  );
}