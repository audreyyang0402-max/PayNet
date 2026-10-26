// frontend/src/app/event/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  is_available: boolean;
  image_url?: string;
}

interface EventMerchant {
  id: string;
  name: string;
  description: string;
  location: string;
  stall_number?: string;
  items: MenuItem[];
}

interface Event {
  id: string;
  name: string;
  description: string;
  location: string;
  event_date: string;
  start_time: string;
  end_time: string;
  banner_image_url?: string;
  created_at: string;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  merchant_id: string;
  merchant_name: string;
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventMerchants, setEventMerchants] = useState<EventMerchant[]>([]);
  const [cart, setCart] = useState<{ [key: string]: CartItem }>({});
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  // Fetch events on load
  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch("http://127.0.0.1:8000/events");
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
          if (data.length > 0) {
            setSelectedEventId(data[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load events", error);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  // Fetch event merchants when event is selected
  useEffect(() => {
    if (!selectedEventId) return;
    async function loadEventMerchants() {
      try {
        const res = await fetch(
          `http://127.0.0.1:8000/events/${selectedEventId}/merchants`
        );
        if (res.ok) {
          const data = await res.json();
          setEventMerchants(data);
        }
      } catch (error) {
        console.error("Failed to load event merchants", error);
      }
    }
    loadEventMerchants();
  }, [selectedEventId]);

  const addToCart = (item: MenuItem, merchantId: string, merchantName: string) => {
    const cartKey = `${merchantId}-${item.id}`;
    setCart((prev) => {
      const current = prev[cartKey] ? prev[cartKey].quantity : 0;
      return {
        ...prev,
        [cartKey]: {
          item,
          quantity: current + 1,
          merchant_id: merchantId,
          merchant_name: merchantName,
        },
      };
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[cartKey] && copy[cartKey].quantity > 1) {
        copy[cartKey] = { ...copy[cartKey], quantity: copy[cartKey].quantity - 1 };
      } else {
        delete copy[cartKey];
      }
      return copy;
    });
  };

  const cartTotal = Object.values(cart).reduce(
    (sum, { item, quantity }) => sum + Number(item.price) * quantity,
    0
  );

  const handleCheckout = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in first before checking out.");
      window.location.href = "/login";
      return;
    }

    if (Object.keys(cart).length === 0) {
      alert("Your cart is empty.");
      return;
    }

    setCheckingOut(true);
    try {
      // For now, show a message since multi-vendor event checkout requires more setup
      alert("Event checkout requires additional setup for multi-vendor orders. Please use the regular merchants section for now.");
    } catch (err: any) {
      alert(err.message || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading events...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">🎉 Payvolution Events</h1>
            <p className="text-gray-500 text-sm">Browse all vendors at special events and festivals.</p>
          </div>
          <Link
            href="/"
            className="bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
          >
            ← Back to Merchants
          </Link>
        </header>

        {/* Events Tabs */}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {events.length === 0 ? (
            <p className="text-gray-500 text-sm">No active events available.</p>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => {
                  setSelectedEventId(event.id);
                  setCart({});
                }}
                className={`px-5 py-3 rounded-2xl font-semibold text-sm transition-all whitespace-nowrap cursor-pointer ${
                  selectedEventId === event.id
                    ? "bg-orange-600 text-white shadow-md"
                    : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                }`}
              >
                {event.name}
                <span className="block text-xs font-normal opacity-80">
                  📍 {event.location}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Vendors Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Info */}
            {selectedEventId && events.find((e) => e.id === selectedEventId) && (
              <div className="bg-gradient-to-r from-orange-500 to-orange-400 text-white p-6 rounded-2xl">
                <h2 className="text-xl font-bold mb-2">
                  {events.find((e) => e.id === selectedEventId)?.name}
                </h2>
                <p className="text-sm opacity-90 mb-3">
                  {events.find((e) => e.id === selectedEventId)?.description}
                </p>
                <div className="text-xs opacity-80">
                  <p>📍 {events.find((e) => e.id === selectedEventId)?.location}</p>
                  <p>
                    🕐{" "}
                    {events.find((e) => e.id === selectedEventId) &&
                      new Date(
                        events.find((e) => e.id === selectedEventId)!.start_time
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                    -{" "}
                    {events.find((e) => e.id === selectedEventId) &&
                      new Date(
                        events.find((e) => e.id === selectedEventId)!.end_time
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                  </p>
                </div>
              </div>
            )}

            {/* Vendor Stalls */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-bold text-gray-900">🎪 Vendor Stalls</h2>
              {eventMerchants.length === 0 ? (
                <p className="text-gray-500 text-sm py-6 text-center">
                  Select an event to see vendors.
                </p>
              ) : (
                <div className="space-y-6">
                  {eventMerchants.map((merchant) => (
                    <div
                      key={merchant.id}
                      className="border border-gray-200 rounded-xl overflow-hidden"
                    >
                      {/* Vendor Header */}
                      <div className="bg-gradient-to-r from-orange-500 to-orange-400 p-4 text-white">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-lg">{merchant.name}</h3>
                            <p className="text-sm opacity-90">
                              {merchant.description}
                            </p>
                            {merchant.stall_number && (
                              <p className="text-xs opacity-80 mt-1">
                                Stall: {merchant.stall_number}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Menu Items */}
                      <div className="p-4 space-y-3">
                        {merchant.items.length === 0 ? (
                          <p className="text-gray-500 text-sm">
                            No items available from this vendor.
                          </p>
                        ) : (
                          merchant.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200"
                            >
                              <div className="flex-1">
                                <p className="font-semibold text-gray-900">
                                  {item.name}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {item.description}
                                </p>
                                <p className="text-sm font-bold text-orange-600 mt-1">
                                  RM {Number(item.price).toFixed(2)}
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  addToCart(item, merchant.id, merchant.name)
                                }
                                disabled={!item.is_available}
                                className="bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ml-3"
                              >
                                + Add
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart Section */}
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 sticky top-6 space-y-4">
              <h2 className="text-lg font-bold text-gray-900 border-b pb-3">
                Your Cart
              </h2>

              {Object.keys(cart).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">
                  Your cart is empty.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Group items by merchant */}
                  {Array.from(
                    new Set(Object.values(cart).map((c) => c.merchant_id))
                  ).map((merchantId) => (
                    <div key={merchantId}>
                      <h3 className="text-xs font-bold text-gray-700 bg-gray-100 p-2 rounded mb-2">
                        {Object.values(cart).find(
                          (c) => c.merchant_id === merchantId
                        )?.merchant_name}
                      </h3>
                      {Object.entries(cart)
                        .filter(([, c]) => c.merchant_id === merchantId)
                        .map(([cartKey, { item, quantity }]) => (
                          <div
                            key={cartKey}
                            className="flex justify-between items-center text-sm border-b pb-2 mb-2"
                          >
                            <div>
                              <p className="font-semibold text-gray-800">
                                {item.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                RM {Number(item.price).toFixed(2)} x {quantity}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => removeFromCart(cartKey)}
                                className="w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <span className="text-xs font-bold text-gray-900 w-4 text-center">
                                {quantity}
                              </span>
                              <button
                                onClick={() =>
                                  setCart((prev) => ({
                                    ...prev,
                                    [cartKey]: {
                                      ...prev[cartKey],
                                      quantity: prev[cartKey].quantity + 1,
                                    },
                                  }))
                                }
                                className="w-6 h-6 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ))}

                  <div className="pt-4 flex justify-between items-center font-bold text-gray-900 border-t">
                    <span>Total:</span>
                    <span>RM {cartTotal.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={handleCheckout}
                    disabled={checkingOut}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {checkingOut ? "Processing..." : "Proceed to Checkout"}
                  </button>

                  <p className="text-xs text-gray-500 text-center">
                    ℹ️ Multi-vendor orders require per-merchant checkout
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
