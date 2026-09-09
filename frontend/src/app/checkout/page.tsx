// src/app/checkout/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
  is_available: boolean;
}

interface Merchant {
  id: string;
  name: string;
  location: string;
  description: string;
}

interface PickupSlot {
  id: string;
  time_slot: string;
  current_bookings: number;
  max_capacity: number;
}

export default function CustomerCheckoutPage() {
  const router = useRouter();
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [cart, setCart] = useState<{ [key: string]: { item: MenuItem; quantity: number } }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMerchants() {
      try {
        const res = await fetch("http://127.0.0.1:8000/merchants");
        if (res.ok) {
          const data = await res.json();
          setMerchants(data);
          if (data.length > 0) setSelectedMerchant(data[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchMerchants();
  }, []);

  useEffect(() => {
    if (!selectedMerchant) return;
    async function fetchMerchantData() {
      const menuRes = await fetch(`http://127.0.0.1:8000/merchants/${selectedMerchant?.id}/items`);
      if (menuRes.ok) {
        const data = await menuRes.json();
        setMenuItems(data);
      }

      const slotsRes = await fetch(`http://127.0.0.1:8000/merchants/${selectedMerchant?.id}/pickup-slots`);
      if (slotsRes.ok) {
        const slotsData = await slotsRes.json();
        setSlots(slotsData);
        if (slotsData.length > 0) setSelectedSlotId(slotsData[0].id);
      }
    }
    fetchMerchantData();
  }, [selectedMerchant]);

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const currentQty = prev[item.id]?.quantity || 0;
      return {
        ...prev,
        [item.id]: { item, quantity: currentQty + 1 },
      };
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[itemId].quantity > 1) {
        copy[itemId].quantity -= 1;
      } else {
        delete copy[itemId];
      }
      return copy;
    });
  };

  const calculateTotal = () => {
    return Object.values(cart).reduce((sum, { item, quantity }) => sum + Number(item.price) * quantity, 0);
  };

  const handlePlaceOrderAndPay = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in as a customer first!");
      router.push("/vendor/login" as any);
      return;
    }

    if (!selectedSlotId) {
      alert("Please select a pickup time slot.");
      return;
    }

    try {
      const orderPayload = {
        merchant_id: selectedMerchant?.id,
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
        const err = await orderRes.json();
        throw new Error(err.detail || "Failed to create order.");
      }

      const orderData = await orderRes.json();
      const orderId = orderData.id;

      const payRes = await fetch(`http://127.0.0.1:8000/orders/${orderId}/pay`, {
        method: "POST",
      });

      if (!payRes.ok) throw new Error("Failed to initialize payment gateway.");

      const payData = await payRes.json();
      
      if (payData.url) {
        window.location.href = payData.url;
      } else {
        throw new Error("Invalid payment gateway response.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading marketplace...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <span className="bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
              Sunway Express Lane
            </span>
            <h1 className="text-2xl font-bold text-gray-900">Campus Food Court</h1>
            <p className="text-gray-500 text-sm">Pick a stall, order ahead, and skip the queue!</p>
          </div>
          <Link
            href="/profile"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-xl transition-all cursor-pointer inline-block"
          >
            👤 My Orders & Profile
          </Link>
        </div>

        {/* Merchant Selector Tabs */}
        <div className="flex space-x-4 overflow-x-auto pb-2">
          {merchants.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setSelectedMerchant(m);
                setCart({});
              }}
              className={`px-5 py-3 rounded-xl font-semibold text-sm transition-all whitespace-nowrap cursor-pointer ${
                selectedMerchant?.id === m.id
                  ? "bg-orange-600 text-white shadow-sm"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {m.name} <span className="text-xs opacity-75 block">📍 {m.location}</span>
            </button>
          ))}
        </div>

        {/* Main Content: Menu & Cart Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Menu Items List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Menu from {selectedMerchant?.name}</h2>
            {menuItems.length === 0 ? (
              <p className="text-gray-500 bg-white p-6 rounded-2xl border border-gray-200 text-center">
                This stall has no menu items available yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {menuItems.map((item) => (
                  <div key={item.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                    <div>
                      {item.image_url && (
                        <div className="w-full h-36 mb-3 rounded-lg overflow-hidden bg-gray-100 relative">
                          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-900">{item.name}</h3>
                        <span className="font-semibold text-orange-600">RM {Number(item.price).toFixed(2)}</span>
                      </div>
                      <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-md ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.is_available ? 'Available' : 'Sold Out'}
                      </span>
                      {item.is_available && (
                        <button
                          onClick={() => addToCart(item)}
                          className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Sidebar */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 h-fit space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Your Cart</h2>
            {Object.keys(cart).length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">Your cart is empty.</p>
            ) : (
              <div className="space-y-4">
                <div className="divide-y divide-gray-100 space-y-3">
                  {Object.values(cart).map(({ item, quantity }) => (
                    <div key={item.id} className="flex justify-between items-center pt-2">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-900">{item.name}</h4>
                        <p className="text-xs text-gray-500">RM {Number(item.price).toFixed(2)} x {quantity}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button onClick={() => removeFromCart(item.id)} className="px-2 py-0.5 bg-gray-100 rounded text-sm text-gray-700 cursor-pointer">-</button>
                        <span className="text-sm font-semibold">{quantity}</span>
                        <button onClick={() => addToCart(item)} className="px-2 py-0.5 bg-gray-100 rounded text-sm text-gray-700 cursor-pointer">+</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pickup Slot Selection */}
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase">Select Pickup Time Slot</label>
                  {slots.length === 0 ? (
                    <p className="text-xs text-red-500">No pickup slots available for this stall yet.</p>
                  ) : (
                    <select
                      value={selectedSlotId}
                      onChange={(e) => setSelectedSlotId(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-gray-900 font-medium"
                    >
                      {slots.map((slot) => (
                        <option key={slot.id} value={slot.id} className="text-gray-900 bg-white py-2">
                          {new Date(slot.time_slot).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({slot.current_bookings}/{slot.max_capacity})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200 flex justify-between items-center font-bold text-gray-900">
                  <span>Total:</span>
                  <span className="text-orange-600">RM {calculateTotal().toFixed(2)}</span>
                </div>

                <button
                  onClick={handlePlaceOrderAndPay}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-all text-sm cursor-pointer shadow-sm"
                >
                  Pay with HitPay 🚀
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}