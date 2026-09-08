// src/app/checkout/page.tsx
"use client";

import { useCart } from "@/context/CartContext";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

export default function CheckoutPage() {
  const { cart, cartTotal } = useCart();
  const router = useRouter(); 
  
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function fetchSlots() {
      if (cart.length === 0) return;

      try {
        const merchantId = cart[0].merchant_id; 
        if (!merchantId) {
          setError("Merchant ID not found in cart.");
          setLoadingSlots(false);
          return;
        }

        const res = await fetch(`http://127.0.0.1:8000/merchants/${merchantId}/pickup-slots`);
        if (!res.ok) throw new Error("Failed to fetch pickup slots");

        const data = await res.json();
        setSlots(data);
      } catch (err: any) {
        setError(err.message || "Could not load pickup slots");
      } finally {
        setLoadingSlots(false);
      }
    }

    fetchSlots();
  }, [cart]);

  const handlePlaceOrder = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      
      if (!token) {
        throw new Error("You must be logged in to place an order! (Authentication required)");
      }

      const payload = {
        merchant_id: cart[0].merchant_id,
        pickup_slot_id: selectedSlot,
        items: cart.map(item => ({
          menu_item_id: item.id,
          quantity: item.quantity
        }))
      };

      const res = await fetch("http://127.0.0.1:8000/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Failed to place order.");
      }

      const orderData = await res.json();
      
      // Request HitPay payment URL for the created order
      const paymentRes = await fetch(`http://127.0.0.1:8000/orders/${orderData.id}/pay`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (!paymentRes.ok) {
        throw new Error("Order placed, but failed to initialize HitPay payment.");
      }

      const paymentData = await paymentRes.json();
      const paymentUrl = paymentData.url || paymentData.payment_url;

      if (paymentUrl) {
        // Redirect user to HitPay sandbox gateway
        window.location.href = paymentUrl;
      } else {
        alert(`Order #${orderData.id} placed successfully, but payment gateway URL was missing.`);
        router.push("/");
      }

    } catch (err: any) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

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

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-medium border border-red-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <span>{error}</span>
            {error.includes("logged in") && (
              <Link 
                href="/login" 
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
              >
                Log In →
              </Link>
            )}
          </div>
        )}

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

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Select Pickup Time</h2>
          {loadingSlots && <p className="text-gray-500 text-sm">Loading available slots from server...</p>}
          
          <div className="grid grid-cols-2 gap-3">
            {slots.map((slot) => {
              const isFull = slot.current_bookings >= slot.max_capacity;
              const timeString = new Date(slot.time_slot).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
              });

              return (
                <button
                  key={slot.id}
                  disabled={isFull}
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`py-3 px-4 rounded-lg border text-sm font-medium transition-all ${
                    isFull 
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed line-through"
                      : selectedSlot === slot.id
                      ? "bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600"
                      : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-gray-50"
                  }`}
                >
                  {timeString} {isFull && "(Full)"}
                </button>
              );
            })}
          </div>
        </div>

        <button 
          onClick={handlePlaceOrder}
          disabled={!selectedSlot || isSubmitting}
          className={`w-full font-bold py-4 rounded-xl transition-all shadow-sm ${
            !selectedSlot || isSubmitting
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          }`}
        >
          {isSubmitting ? "Redirecting to Payment..." : selectedSlot ? "Proceed to Payment" : "Select a pickup time"}
        </button>
      </div>
    </main>
  );
}