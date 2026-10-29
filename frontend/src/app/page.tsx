// frontend/src/app/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import Link from "next/link";
import RecommendationWidget from "@/components/RecommendationWidget";

interface Merchant {
  id: string;
  name: string;
  description: string | null;
  location: string;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  image_url?: string | null;
  merchant_id: string;
}

interface PickupSlot {
  id: string;
  time_slot: string;
  current_bookings: number;
  max_capacity: number;
}

// Hardcoded items for the Event section so users can add them to cart immediately
const EVENT_MERCHANT_ID = "event-popups-123";
const eventItems: MenuItem[] = [
  {
    id: "evt-item-1",
    name: "Chicken Rice",
    description: "Juicy steam chicken with side of rice",
    price: 10.00,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url: "https://images.unsplash.com/photo-1600336153113-d66c79abefe8?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: "evt-item-2",
    name: "Satay",
    description: "Spicy and Delicious",
    price: 1.50,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url: "https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: "evt-item-3",
    name: "Signature Boba",
    description: "Freshly brewed brown sugar boba.",
    price: 9.90,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url: "https://images.unsplash.com/photo-1558855567-1a341e8c7506?auto=format&fit=crop&w=500&q=80",
  }
];

export default function Home() {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [menuItemsByMerchant, setMenuItemsByMerchant] = useState<Record<string, MenuItem[]>>({});
  const [menusLoading, setMenusLoading] = useState(true);
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
        const res = await fetch(`${BACKEND_URL}/merchants`);
        if (res.ok) {
          const data = await res.json();
          const eventMerchant: Merchant = {
            id: EVENT_MERCHANT_ID,
            name: "Payvolution Event Pop-ups",
            description: "Limited time event vendors",
            location: "Boulevard"
          };
          setMerchants([...data, eventMerchant]);
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

  // Load pickup slots
  useEffect(() => {
    let cancelled = false;
    setPickupSlots([]);
    setSelectedSlotId("");
    if (!selectedMerchantId) return () => { cancelled = true; };

    async function loadPickupSlots() {
      try {
        if (selectedMerchantId === EVENT_MERCHANT_ID) {
          const mockSlots = [
            { id: "slot-1", time_slot: new Date(Date.now() + 15 * 60000).toISOString(), current_bookings: 2, max_capacity: 20 },
            { id: "slot-2", time_slot: new Date(Date.now() + 45 * 60000).toISOString(), current_bookings: 5, max_capacity: 20 },
          ];
          setPickupSlots(mockSlots);
          setSelectedSlotId(mockSlots[0].id);
          return;
        }

        const response = await fetch(`${BACKEND_URL}/merchants/${selectedMerchantId}/pickup-slots`);
        if (response.ok) {
          const slots: PickupSlot[] = await response.json();
          if (!cancelled) {
            setPickupSlots(slots);
            setSelectedSlotId(slots[0]?.id ?? "");
          }
        }
      } catch (error) {
        if (!cancelled) console.error("Failed to load pickup slots", error);
      }
    }
    loadPickupSlots();
    return () => { cancelled = true; };
  }, [selectedMerchantId]);

  // Load stall menus
  useEffect(() => {
    let cancelled = false;
    async function loadMenus() {
      const backendMerchants = merchants.filter(m => m.id !== EVENT_MERCHANT_ID);
      if (backendMerchants.length === 0) {
        setMenusLoading(false);
        return;
      }
      setMenusLoading(true);
      const entries = await Promise.all(backendMerchants.map(async (merchant) => {
        try {
          const response = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/items`);
          return [merchant.id, response.ok ? await response.json() : []] as const;
        } catch {
          return [merchant.id, []] as const;
        }
      }));
      if (!cancelled) {
        setMenuItemsByMerchant(Object.fromEntries(entries));
        setMenusLoading(false);
      }
    }
    if (merchants.length > 0) {
      loadMenus();
    }
    return () => { cancelled = true; };
  }, [merchants]);

  const addToCart = (item: MenuItem) => {
    if (selectedMerchantId && selectedMerchantId !== item.merchant_id && Object.keys(cart).length > 0) {
      const currentMerchant = merchants.find((merchant) => merchant.id === selectedMerchantId);
      const nextMerchant = merchants.find((merchant) => merchant.id === item.merchant_id);
      const shouldSwitch = window.confirm(`Your cart has items from ${currentMerchant?.name ?? "another stall"}. Switching to ${nextMerchant?.name ?? "this stall"} will clear it. Continue?`);
      if (!shouldSwitch) return;
      setCart({});
    }
    setSelectedMerchantId(item.merchant_id);
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
  const allMenuItems = Object.values(menuItemsByMerchant).flat();
  const cartMerchant = merchants.find((merchant) => merchant.id === selectedMerchantId);

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
      const orderPayload = {
        merchant_id: selectedMerchantId,
        pickup_slot_id: selectedSlotId,
        items: Object.values(cart).map(({ item, quantity }) => ({
          menu_item_id: item.id,
          quantity: quantity,
        })),
      };

      const orderRes = await fetch(`${BACKEND_URL}/orders`, {
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

      // Redirect straight to our DuitNow QR verification page
      window.location.href = `/checkout/success/${orderId}`;
    } catch (err: any) {
      alert(err.message || "Checkout failed.");
    } finally {
      setCheckingOut(false);
    }
  };

  // Regular Item Card Component for the standard stalls at the bottom
  const ItemCard = ({ item }: { item: MenuItem }) => (
    <article className="flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className="h-40 w-full object-cover" />
      ) : (
        <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-4xl" aria-hidden="true">🍽️</div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-slate-900 text-base leading-tight">{item.name}</h4>
          <span className="shrink-0 font-bold text-[#EA580C]">RM {Number(item.price).toFixed(2)}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">
          {item.description || "Made fresh at the stall."}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.is_available ? "bg-[#ECFDF5] text-[#059669]" : "bg-slate-100 text-slate-500"}`}>
            {item.is_available ? "Available" : "Sold out"}
          </span>
          <button
            type="button"
            onClick={() => addToCart(item)}
            disabled={!item.is_available}
            className="rounded-lg bg-[#F04B14] px-4 py-1.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Add
          </button>
        </div>
      </div>
    </article>
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading marketplace...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sunway Express Lane</h1>
          </div>
          <div className="flex items-center space-x-3">
            <Link 
              href="/vendor/rental" 
              className="bg-orange-50 hover:bg-orange-100 text-orange-600 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all"
            >
              Boulevard Rentals
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

        {/* Interactive Payvolution Events Promo Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-700 p-6 shadow-md w-full">
          <div className="relative z-10 flex flex-col gap-6">
            
            {/* Top Row: Title and Link to /event */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="text-white">
                <div className="flex items-center gap-3">
                  <img 
                    src="/payvolution-events.png" 
                    alt="Payvolution Events" 
                    className="h-8 w-8 rounded-lg bg-white/20 p-1.5 object-contain" 
                  />
                  <h2 className="text-2xl font-bold tracking-tight">Payvolution Events</h2>
                </div>
              </div>
              <Link 
                href="/event" 
                className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all border border-white/30 text-center"
              >
                See all event vendors
              </Link>
            </div>

            {/* Bottom Row: Horizontally scrolling RECTANGULAR event cards */}
            <div className="flex gap-4 overflow-x-auto pb-2 snap-x hide-scrollbar">
              {eventItems.map((item) => (
                <div key={item.id} className="flex w-[320px] shrink-0 snap-start items-center gap-4 rounded-xl bg-white p-3 shadow-sm border border-white/40">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl" aria-hidden="true">🍽️</div>
                  )}
                  
                  <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="truncate font-bold text-slate-900 text-sm">{item.name}</h4>
                      <span className="shrink-0 font-bold text-[#EA580C] text-sm">RM {Number(item.price).toFixed(2)}</span>
                    </div>
                    
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.description || "Made fresh at the stall."}
                    </p>
                    
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.is_available ? "bg-[#ECFDF5] text-[#059669]" : "bg-slate-100 text-slate-500"}`}>
                        {item.is_available ? "Available" : "Sold out"}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        disabled={!item.is_available}
                        className="rounded-lg bg-[#F04B14] px-3 py-1 text-xs font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decorative Background Elements */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white opacity-10 blur-2xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-20 -mb-10 h-24 w-24 rounded-full bg-indigo-400 opacity-20 blur-xl pointer-events-none"></div>
        </div>

        {/* AI Recommendation Widget */}
        <RecommendationWidget items={allMenuItems} merchants={merchants.filter(m => m.id !== EVENT_MERCHANT_ID)} onAddToCart={addToCart} loading={menusLoading} />

        {/* Stall-by-stall marketplace and single-stall checkout */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-700">Find your next meal</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">Browse campus stalls</h2>
              </div>
              <p className="text-sm text-slate-500">Scroll each row to see the full menu</p>
            </div>

            {merchants.filter(m => m.id !== EVENT_MERCHANT_ID).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No stalls are available right now.
              </div>
            ) : (
              merchants.filter(m => m.id !== EVENT_MERCHANT_ID).map((merchant) => {
                const items = menuItemsByMerchant[merchant.id] ?? [];
                return (
                  <section key={merchant.id} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 md:grid-cols-[12rem_minmax(0,1fr)]">
                    <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Shop / stall</p>
                        <h3 className="mt-1 text-lg font-bold leading-snug text-slate-900">{merchant.name}</h3>
                        <p className="mt-2 text-sm text-slate-500">📍 {merchant.location || "Campus"}</p>
                      </div>
                      {merchant.description && (
                        <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{merchant.description}</p>
                      )}
                    </div>

                    <div className="min-w-0">
                      {menusLoading ? (
                        <p className="py-8 text-center text-sm text-slate-400">Loading this stall’s menu…</p>
                      ) : items.length === 0 ? (
                        <p className="py-8 text-center text-sm text-slate-400">No menu items available yet.</p>
                      ) : (
                        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 hide-scrollbar">
                          {items.map((item) => (
                            <ItemCard key={item.id} item={item} />
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })
            )}
          </section>

          <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-5">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">Your Cart</h2>
              {Object.keys(cart).length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Ordering from {cartMerchant?.name ?? "selected stall"}</p>
              )}
            </div>

            {Object.keys(cart).length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Choose a stall and add something tasty.</p>
            ) : (
              <div className="space-y-3">
                {Object.values(cart).map(({ item, quantity }) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">RM {Number(item.price).toFixed(2)} × {quantity}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => removeFromCart(item.id)}
                        className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                      >
                        −
                      </button>
                      <span className="w-4 text-center text-xs font-bold">{quantity}</span>
                      <button
                        type="button"
                        aria-label={`Add one ${item.name}`}
                        onClick={() => addToCart(item)}
                        className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}

                <div className="space-y-2 pt-1">
                  <label htmlFor="pickup-slot" className="text-xs font-bold uppercase tracking-wide text-slate-700">
                    Pickup time
                  </label>
                  {pickupSlots.length === 0 ? (
                    <p className="text-xs text-red-600">No pickup slots are available for this stall.</p>
                  ) : (
                    <select
                      id="pickup-slot"
                      value={selectedSlotId}
                      onChange={(event) => setSelectedSlotId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800"
                    >
                      {pickupSlots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {new Date(slot.time_slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ({slot.current_bookings}/{slot.max_capacity} booked)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-between border-t border-slate-100 pt-3 font-bold text-slate-900">
                  <span>Total</span>
                  <span>RM {cartTotal.toFixed(2)}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={checkingOut || pickupSlots.length === 0}
                  className="w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkingOut ? "Redirecting to DuitNow..." : "Proceed to DuitNow Payment"}
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}