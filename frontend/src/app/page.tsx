// frontend/src/app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RecommendationWidget from "@/components/RecommendationWidget";

interface Merchant {
  id: string;
  name: string;
  description: string;
  location: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  image_url?: string;
}

interface PickupSlot {
  id: string;
  time_slot: string;
  current_bookings: number;
  max_capacity: number;
}

export default function Home() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [cart, setCart] = useState<{ [key: string]: { item: MenuItem; quantity: number } }>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  // Fetch merchants on load
  useEffect(() => {
    async function loadMerchants() {
      try {
        const res = await fetch("http://127.0.0.1:8000/merchants");
        if (res.ok) {
          const data = await res.json();
          setMerchants(data);
          if (data.length > 0) {
            setSelectedMerchantId(data[0].id);
          }
        }
      } catch (error) {
        setErrorMessage("Could not connect to the FastAPI backend.");
      } finally {
        setLoading(false);
      }
    }
    loadMerchants();
  }, []);

  // Fetch menu items and pickup slots when selected merchant changes
  useEffect(() => {
    if (!selectedMerchantId) return;
    async function loadMerchantData() {
      try {
        const [menuRes, slotsRes] = await Promise.all([
          fetch(`http://127.0.0.1:8000/merchants/${selectedMerchantId}/items`),
          fetch(`http://127.0.0.1:8000/merchants/${selectedMerchantId}/pickup-slots`)
        ]);

        if (menuRes.ok) setMenuItems(await menuRes.json());
        if (slotsRes.ok) {
          const slots = await slotsRes.json();
          setPickupSlots(slots);
          if (slots.length > 0) setSelectedSlotId(slots[0].id);
        }
      } catch (error) {
        console.error("Failed to load merchant data", error);
      }
    }
    loadMerchantData();
  }, [selectedMerchantId]);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const current = prev[item.id] ? prev[item.id].quantity : 0;
      return {
        ...prev,
        [item.id]: { item, quantity: current + 1 },
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[itemId] && copy[itemId].quantity > 1) {
        copy[itemId] = { ...copy[itemId], quantity: copy[itemId].quantity - 1 };
      } else {
        delete copy[itemId];
      }
      return copy;
    });
  };

  const cartTotal = Object.values(cart).reduce((sum, { item, quantity }) => sum + Number(item.price) * quantity, 0);

  // Handle Order Creation and HitPay Payment Gateway Redirection
  const handleCheckout = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in first before checking out.");
      window.location.href = "/login";
      return;
    }

    if (!selectedSlotId) {
      alert("Please select an available pickup slot.");
      return;
    }

    if (Object.keys(cart).length === 0 || !selectedMerchantId) {
      alert("Your cart is empty.");
      return;
    }

    setCheckingOut(true);
    try {
      // 1. Create Order
      const orderPayload = {
        merchant_id: selectedMerchantId,
        pickup_slot_id: selectedSlotId,
        items: Object.values(cart).map(({ item, quantity }) => ({
          menu_item_id: item.id,
          quantity: quantity,
        })),
      };

      const orderRes = await fetch("http://127.0.0.1:8000/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orderPayload),
      });

      if (!orderRes.ok) {
        const errData = await orderRes.json();
        throw new Error(errData.detail || "Failed to create order.");
      }

      const orderData = await orderRes.json();
      const orderId = orderData.id;

      // 2. Trigger HitPay Payment Request
      const payRes = await fetch(`http://127.0.0.1:8000/orders/${orderId}/pay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!payRes.ok) {
        throw new Error("Failed to initialize payment gateway.");
      }

      const payData = await payRes.json();
      if (payData.url) {
        // Redirect user to HitPay Sandbox payment page
        window.location.href = payData.url;
      } else {
        throw new Error("Invalid payment gateway response.");
      }
    } catch (err: any) {
      alert(err.message || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading marketplace...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sunway Express Lane</h1>
            <p className="text-gray-500 text-sm">Preorder your campus meals, check AI picks, and skip the queue.</p>
          </div>
          <div className="flex items-center space-x-3">
            <Link 
              href="/vendor/rental" 
              className="bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
            >
              🎪 Boulevard Rentals
            </Link>
            <Link 
              href="/profile" 
              className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
            >
              👤 My Profile
            </Link>
          </div>
        </header>

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            {errorMessage}
          </div>
        )}

        {/* AI Recommendation Widget */}
        <RecommendationWidget />

        {/* Unified Ordering & Merchant Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left / Center: Merchants & Menu */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Merchant Tabs */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {merchants.map((merchant) => (
                <button
                  key={merchant.id}
                  onClick={() => setSelectedMerchantId(merchant.id)}
                  className={`px-5 py-3 rounded-2xl font-semibold text-sm transition-all whitespace-nowrap cursor-pointer ${
                    selectedMerchantId === merchant.id
                      ? "bg-orange-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {merchant.name}
                  <span className="block text-xs font-normal opacity-80">📍 {merchant.location}</span>
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Menu Items</h2>
              {menuItems.length === 0 ? (
                <p className="text-gray-500 text-sm py-6 text-center">No menu items available for this merchant.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {menuItems.map((item) => (
                    <div key={item.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex flex-col justify-between space-y-3">
                      <div>
                        {/* Dish Image Preview */}
                        {item.image_url && (
                          <div className="w-full h-36 rounded-lg overflow-hidden bg-gray-100 mb-3">
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex justify-between items-start">
                          <h3 className="font-bold text-gray-900 text-sm">{item.name}</h3>
                          <span className="text-orange-600 font-bold text-sm">RM {Number(item.price).toFixed(2)}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{item.description}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${
                          item.is_available 
                            ? "bg-green-100 text-green-700" 
                            : "bg-red-100 text-red-700"
                        }`}>
                          {item.is_available ? "Available" : "Unavailable"}
                        </span>
                        <button
                          onClick={() => addToCart(item)}
                          disabled={!item.is_available}
                          className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Live Cart & Pickup Selection Panel */}
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-3">Your Cart</h2>
              
              {Object.keys(cart).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">Your cart is empty.</p>
              ) : (
                <div className="space-y-3">
                  {Object.values(cart).map(({ item, quantity }) => (
                    <div key={item.id} className="flex justify-between items-center text-sm border-b pb-2">
                      <div>
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">RM {Number(item.price).toFixed(2)} x {quantity}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => removeFromCart(item.id)}
                          className="w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold text-gray-900 w-4 text-center">{quantity}</span>
                        <button 
                          onClick={() => addToCart(item)}
                          className="w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Pickup Slot Selection */}
                  <div className="pt-2 space-y-2">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">Select Pickup Slot</label>
                    {pickupSlots.length === 0 ? (
                      <p className="text-xs text-red-500">No pickup slots available for this merchant.</p>
                    ) : (
                      <select
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-xs rounded-xl p-2.5 cursor-pointer"
                      >
                        {pickupSlots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {new Date(slot.time_slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({slot.current_bookings}/{slot.max_capacity} booked)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="pt-4 flex justify-between items-center font-bold text-gray-900 border-t">
                    <span>Total:</span>
                    <span>RM {cartTotal.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={checkingOut}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {checkingOut ? "Redirecting to Payment..." : "Pay with HitPay"}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    </main>
  );
}