// src/components/CartSummary.tsx
"use client";

import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CartSummary() {
  const { cart, cartTotal } = useCart();
  const pathname = usePathname();

  // Hide the floating banner if the cart is empty OR on checkout page / homepage (home has its own header cart & drawer)
  if (cart.length === 0 || pathname === "/checkout" || pathname === "/") {
    return null;
  }

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        <div className="bg-gray-900 rounded-2xl shadow-2xl flex items-center justify-between p-4 text-white">
          <div className="flex flex-col">
            <span className="font-semibold text-lg">
              {totalItems} item{totalItems > 1 ? "s" : ""}
            </span>
            <span className="text-gray-400 text-sm">Ready for pickup</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="font-bold text-xl">RM {cartTotal.toFixed(2)}</span>

            <Link
              href="/checkout"
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors"
            >
              Checkout
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
