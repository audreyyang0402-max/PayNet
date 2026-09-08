// src/app/checkout/page.tsx
"use client";

import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { useState } from "react";

// Temporary mock slots so we can build the UI before hitting the database
const MOCK_SLOTS = [
  { id: "slot-1", time: "12:00 PM - 12:15 PM" },
  { id: "slot-2", time: "12:15 PM - 12:30 PM" },
  { id: "slot-3", time: "12:30 PM - 12:45 PM" },
  { id: "slot-4", time: "12:45 PM - 1:00 PM" },
];

export default function CheckoutPage() {
  const { cart, cartTotal } = useCart();
  
  // State to remember which time slot the user clicked
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  if (cart.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 p-8 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Your cart is empty</h1>
        <Link href="/" className="text-blue-600 hover:underline font-medium">
          ← Back to Merchants
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 hover:underline text-sm font-medium mb-6 inline-block">
          ← Keep Shopping
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        {/* Order Summary Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Order Summary</h2>
          
          <div className="space-y-4">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center border-b border-gray-100 pb-4">
                <div>
                  <span className="font-medium text-gray-900">{item.name}</span>
                  <span className="text-gray-500 ml-2 text-sm">x{item.quantity}</span>
                </div>
                <span className="font-medium text-gray-900">
                  RM {(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          
          <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-200">
            <span className="text-lg font-bold text-gray-900">Total</span>
            <span className="text-2xl font-bold text-blue-600">RM {cartTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Pickup Time Section */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Pickup Time</h2>
          
          <div className="grid grid-cols-2 gap-3">
            {MOCK_SLOTS.map((slot) => (
              <button
                key={slot.id}
                onClick={() => setSelectedSlot(slot.id)}
                className={`py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                  selectedSlot === slot.id
                    ? "bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600"
                    : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-gray-50"
                }`}
              >
                {slot.time}
              </button>
            ))}
          </div>
        </div>

        {/* Place Order Button - Disables if no slot is selected */}
        <button 
          disabled={!selectedSlot}
          className={`w-full font-bold py-4 rounded-xl transition-all shadow-sm ${
            selectedSlot 
              ? "bg-blue-600 hover:bg-blue-700 text-white" 
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          }`}
        >
          {selectedSlot ? "Place Order" : "Select a pickup time"}
        </button>
      </div>
    </main>
  );
}