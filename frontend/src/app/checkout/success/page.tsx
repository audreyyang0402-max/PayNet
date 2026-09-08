// src/app/checkout/success/page.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function OrderSuccessPage() {
  // Clear the cart from localStorage directly
  useEffect(() => {
    localStorage.removeItem("cart");
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Successful!</h1>
        <p className="text-gray-500 text-sm mb-6">
          Thank you for your order with Sunway Express Lane. Your pickup slot has been secured.
        </p>

        <div className="space-y-3">
          <Link
            href="/orders"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm text-sm"
          >
            View My Orders
          </Link>
          <Link
            href="/"
            className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-all text-sm"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}