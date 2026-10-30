// frontend/src/app/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Sunway Express Lane — Campus Food Marketplace
//
// Features:
//  • Mobile-first, responsive, compact UI with warm PayNet brand colours.
//  • Header with Payvolution logo, Boulevard Rentals, and user Profile.
//  • Animated jumping profile avatar & toast banner when items are added to cart.
//  • Payvolution Events interactive promo section.
//  • Tab-based AI & Smart Recommendation Widget (Hot Deals, Rahmah RM5, etc.).
//  • Stall-by-stall menu browsing with compact, colourful food cards.
//  • Dual-mode Cart: sticky sidebar on desktop, floating bottom drawer on mobile.
//  • Seamless DuitNow QR checkout flow.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import RecommendationWidget from "@/components/RecommendationWidget";

// ─── Type Definitions ────────────────────────────────────────────────────────

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

// ─── Hardcoded Event Pop-up Items ───────────────────────────────────────────
// These represent limited-time campus event vendors (Payvolution Events).

const EVENT_MERCHANT_ID = "event-popups-123";

const eventItems: MenuItem[] = [
  {
    id: "evt-item-1",
    name: "Chicken Rice",
    description: "Juicy steamed chicken with fragrant rice and chili dip. [Main Course | Halal]",
    price: 10.0,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url:
      "https://images.unsplash.com/photo-1600336153113-d66c79abefe8?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: "evt-item-2",
    name: "Satay (Stick)",
    description: "Grilled marinated skewers with peanut sauce. [Snack | 🌶️ Mild | Halal]",
    price: 1.5,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url:
      "https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=500&q=80",
  },
  {
    id: "evt-item-3",
    name: "Signature Boba",
    description: "Freshly brewed brown sugar boba with fresh farm milk. [Beverage | Sweet]",
    price: 9.9,
    is_available: true,
    merchant_id: EVENT_MERCHANT_ID,
    image_url:
      "https://images.unsplash.com/photo-1558855567-1a341e8c7506?auto=format&fit=crop&w=500&q=80",
  },
];

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Home() {
  // ── State: Merchants & Menus ──
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [menuItemsByMerchant, setMenuItemsByMerchant] = useState<Record<string, MenuItem[]>>({});
  const [menusLoading, setMenusLoading] = useState(true);

  // ── State: Pickup Slots ──
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  // ── State: Cart (single stall at a time) ──
  const [cart, setCart] = useState<{ [key: string]: { item: MenuItem; quantity: number } }>({});
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // ── State: Animations & Toasts ──
  const [isProfileJumping, setIsProfileJumping] = useState(false);
  const [isCartBouncing, setIsCartBouncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ── State: User Profile (from localStorage) ──
  const [userProfilePic, setUserProfilePic] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string>("");

  // ── State: Page status ──
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);

  // ─── 1. Load User Profile Info from localStorage ───────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      const pic = localStorage.getItem("profilePicture");
      if (pic) setUserProfilePic(pic);

      const preferred = localStorage.getItem("preferredName");
      const savedName = localStorage.getItem("userName");
      setUserDisplayName(preferred || savedName || "Profile");
    }
  }, []);

  // ─── 2. Fetch Merchants on Load ───────────────────────────────────────────
  useEffect(() => {
    async function loadMerchants() {
      try {
        const res = await fetch(`${BACKEND_URL}/merchants`);
        if (res.ok) {
          const data = await res.json();
          const eventMerchant: Merchant = {
            id: EVENT_MERCHANT_ID,
            name: "Payvolution Event Pop-ups",
            description: "Limited time event vendors at the campus boulevard.",
            location: "Boulevard Walkway",
          };
          setMerchants([...data, eventMerchant]);
          if (data.length > 0) {
            setSelectedMerchantId(data[0].id);
          }
        }
      } catch (error) {
        setErrorMessage("Could not connect to the backend server.");
      } finally {
        setLoading(false);
      }
    }
    loadMerchants();
  }, []);

  // ─── 3. Load Pickup Slots for Selected Stall ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setPickupSlots([]);
    setSelectedSlotId("");
    if (!selectedMerchantId) return () => { cancelled = true; };

    async function loadPickupSlots() {
      try {
        // Fallback slots for event stall
        if (selectedMerchantId === EVENT_MERCHANT_ID) {
          const mockSlots = [
            {
              id: "slot-1",
              time_slot: new Date(Date.now() + 15 * 60000).toISOString(),
              current_bookings: 2,
              max_capacity: 20,
            },
            {
              id: "slot-2",
              time_slot: new Date(Date.now() + 45 * 60000).toISOString(),
              current_bookings: 5,
              max_capacity: 20,
            },
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

  // ─── 4. Load Stall Menus for All Backend Merchants ────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadMenus() {
      const backendMerchants = merchants.filter((m) => m.id !== EVENT_MERCHANT_ID);
      if (backendMerchants.length === 0) {
        setMenusLoading(false);
        return;
      }
      setMenusLoading(true);
      const entries = await Promise.all(
        backendMerchants.map(async (merchant) => {
          try {
            const response = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/items`);
            return [merchant.id, response.ok ? await response.json() : []] as const;
          } catch {
            return [merchant.id, []] as const;
          }
        })
      );
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

  // ─── 5. Add to Cart Handler (with jumping animation & toast) ───────────────
  const addToCart = (item: MenuItem) => {
    // If switching stalls, prompt user to confirm cart reset
    if (selectedMerchantId && selectedMerchantId !== item.merchant_id && Object.keys(cart).length > 0) {
      const currentMerchant = merchants.find((merchant) => merchant.id === selectedMerchantId);
      const nextMerchant = merchants.find((merchant) => merchant.id === item.merchant_id);
      const shouldSwitch = window.confirm(
        `Your cart has items from "${currentMerchant?.name ?? "another stall"}". Switching to "${nextMerchant?.name ?? "this stall"}" will clear it. Continue?`
      );
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

    // ── Trigger Cart & Profile Bouncing Animation ──
    setIsCartBouncing(true);
    setIsProfileJumping(true);
    setTimeout(() => {
      setIsCartBouncing(false);
      setIsProfileJumping(false);
    }, 700);

    // ── Trigger Toast Message (Don't forget to check out at the cart) ──
    setToastMessage(`🛒 Added ${item.name}! Don't forget to check out at the cart.`);
    setTimeout(() => {
      setToastMessage((msg) => (msg?.includes(item.name) ? null : msg));
    }, 4000);
  };

  // ─── 6. Remove from Cart Handler ──────────────────────────────────────────
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

  // ── Derived Cart Values ──
  const cartTotal = useMemo(
    () => Object.values(cart).reduce((sum, { item, quantity }) => sum + Number(item.price) * quantity, 0),
    [cart]
  );
  const totalItemCount = useMemo(
    () => Object.values(cart).reduce((sum, { quantity }) => sum + quantity, 0),
    [cart]
  );
  const allMenuItems = useMemo(
    () => Object.values(menuItemsByMerchant).flat(),
    [menuItemsByMerchant]
  );
  const cartMerchant = useMemo(
    () => merchants.find((merchant) => merchant.id === selectedMerchantId),
    [merchants, selectedMerchantId]
  );

  // ─── 7. Checkout Handler (FastAPI + DuitNow) ──────────────────────────────
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

      // Redirect straight to DuitNow QR verification page
      window.location.href = `/checkout/success/${orderId}`;
    } catch (err: any) {
      alert(err.message || "Checkout failed.");
    } finally {
      setCheckingOut(false);
    }
  };

  // ─── 8. Compact Item Card Component ───────────────────────────────────────
  const ItemCard = ({ item }: { item: MenuItem }) => {
    const desc = item.description || "";
    const isSpicy = /spicy|pedas|sambal|chili/i.test(`${item.name} ${desc}`);
    const isRahmah = Number(item.price) <= 5.0;

    return (
      <article className="flex w-52 sm:w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
        {/* Item image */}
        <div className="relative h-28 sm:h-36 w-full overflow-hidden bg-slate-100">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden="true">
              🍽️
            </div>
          )}

          {/* Quick badge overlays */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {isRahmah && (
              <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow">
                🍚 RM5 Rahmah
              </span>
            )}
            {isSpicy && (
              <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                🌶️ Spicy
              </span>
            )}
          </div>
        </div>

        {/* Item Details */}
        <div className="flex flex-1 flex-col p-3">
          <div className="flex items-start justify-between gap-1">
            <h4 className="font-bold text-slate-900 text-sm leading-tight line-clamp-1">{item.name}</h4>
            <span className="shrink-0 font-extrabold text-[#F04B14] text-sm">
              RM {Number(item.price).toFixed(2)}
            </span>
          </div>

          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-slate-500">
            {desc || "Made fresh at the stall."}
          </p>

          {/* Availability + Add to Cart button */}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.is_available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${item.is_available ? "bg-emerald-500" : "bg-slate-400"}`}
              />
              {item.is_available ? "Available" : "Sold out"}
            </span>

            <button
              type="button"
              onClick={() => addToCart(item)}
              disabled={!item.is_available}
              className="rounded-lg bg-[#F04B14] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              + Add
            </button>
          </div>
        </div>
      </article>
    );
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-[#F04B14]" />
        <p className="mt-3 text-sm font-medium text-slate-600">Loading Sunway Express Lane…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8 pb-28 lg:pb-8">
      {/* ────────────────────────────────────────────────────────────────
          FLOATING TOAST NOTIFICATION
          Appears at the top when user adds items to cart
      ──────────────────────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md animate-slide-up">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-900/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md border border-slate-700">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              className="shrink-0 rounded-lg bg-[#F04B14] px-3 py-1 text-xs font-bold text-white shadow hover:bg-orange-600"
            >
              View Cart →
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* ────────────────────────────────────────────────────────────────
            HEADER
            Compact, mobile-friendly with logo beside title and profile
        ──────────────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-orange-100">
          {/* Brand Logo & Title */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/payvolution-events.png"
              alt="Payvolution Logo"
              className="h-9 w-9 rounded-xl object-contain p-1 bg-orange-50 border border-orange-200 transition group-hover:scale-105"
            />
            <div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-black tracking-tight text-slate-900 group-hover:text-[#F04B14] transition-colors">
                Sunway Express Lane
              </h1>
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-orange-600">
                Campus Food Ordering
              </span>
            </div>
          </Link>

          {/* Action Navigation */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Boulevard Rentals link */}
            <Link
              href="/vendor/rental"
              className="hidden sm:inline-flex bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition border border-orange-200/60"
            >
              🎪 Rentals
            </Link>

            {/* 🛒 Cart Button — Positioned at the LEFT-HAND SIDE of My Profile */}
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              className={`relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer border ${
                totalItemCount > 0
                  ? "bg-[#F04B14] hover:bg-orange-700 text-white border-orange-600 shadow-md"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200"
              } ${isCartBouncing ? "animate-cart-bounce ring-4 ring-orange-300 scale-105" : ""}`}
              aria-label="Shopping Cart"
              title="View your cart and check out"
            >
              <span className="text-base sm:text-lg">🛒</span>
              <span className="font-extrabold">Cart</span>

              {/* Item count badge */}
              {totalItemCount > 0 ? (
                <span className="ml-0.5 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-white text-[#F04B14] text-[11px] font-black shadow-sm">
                  {totalItemCount}
                </span>
              ) : (
                <span className="text-slate-400 font-normal text-xs">(0)</span>
              )}
            </button>

            {/* Profile Button */}
            <Link
              href="/profile"
              className={`relative flex items-center gap-1.5 sm:gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition border border-slate-200 cursor-pointer ${
                isProfileJumping ? "animate-cart-bounce ring-4 ring-orange-300 bg-orange-100 text-orange-700" : ""
              }`}
              title="View your profile, photo & orders"
            >
              {/* Profile Avatar / Photo */}
              {userProfilePic ? (
                <img
                  src={userProfilePic}
                  alt="Profile"
                  className="h-6 w-6 rounded-full object-cover border border-orange-400"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-600 text-[11px] font-bold text-white">
                  {userDisplayName.charAt(0).toUpperCase()}
                </span>
              )}

              <span className="hidden sm:inline truncate max-w-[100px]">{userDisplayName}</span>
            </Link>
          </div>
        </header>

        {/* Backend Error Banner */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs sm:text-sm">
            {errorMessage}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            PAYVOLUTION EVENTS PROMO CARD
            Colourful purple-to-indigo banner with horizontally scrolling cards
        ──────────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-600 to-purple-800 p-4 sm:p-6 shadow-md w-full text-white">
          <div className="relative z-10 flex flex-col gap-4 sm:gap-5">
            {/* Top Row: Title + Link */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/payvolution-events.png"
                  alt="Payvolution Events"
                  className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-white/20 p-1.5 object-contain backdrop-blur-sm"
                />
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Payvolution Events</h2>
                  <p className="text-xs text-purple-200">Limited-time pop-up campus stalls & treats</p>
                </div>
              </div>

              <Link
                href="/events"
                className="self-start sm:self-auto shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition border border-white/30"
              >
                See all vendors →
              </Link>
            </div>

            {/* Bottom Row: Horizontally scrolling rectangular event cards */}
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x hide-scrollbar">
              {eventItems.map((item) => (
                <div
                  key={item.id}
                  className="flex w-[260px] sm:w-[300px] shrink-0 snap-start items-center gap-3 rounded-xl bg-white p-3 shadow-md border border-white/40 text-slate-900"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 sm:h-20 sm:w-20 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-2xl">
                      🍽️
                    </div>
                  )}

                  <div className="flex flex-1 flex-col min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h4 className="truncate font-bold text-slate-900 text-xs sm:text-sm">{item.name}</h4>
                      <span className="shrink-0 font-extrabold text-[#F04B14] text-xs sm:text-sm">
                        RM {Number(item.price).toFixed(2)}
                      </span>
                    </div>

                    <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                      {item.description || "Made fresh for the event."}
                    </p>

                    <div className="mt-2 flex items-center justify-between gap-1">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                        Available
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="rounded-lg bg-[#F04B14] px-3 py-1 text-xs font-bold text-white transition hover:bg-orange-700 active:scale-95"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Decorative Background Glows */}
          <div className="absolute top-0 right-0 -mt-10 -mr-10 h-36 w-36 rounded-full bg-white opacity-10 blur-2xl pointer-events-none" />
          <div className="absolute bottom-0 left-20 -mb-10 h-24 w-24 rounded-full bg-indigo-400 opacity-20 blur-xl pointer-events-none" />
        </div>

        {/* ────────────────────────────────────────────────────────────────
            TAB-BASED RECOMMENDATION WIDGET
            Hot Deals, Budget Friendly, RM5 Rahmah, Not Spicy, All Picks
        ──────────────────────────────────────────────────────────────── */}
        <RecommendationWidget
          items={allMenuItems}
          merchants={merchants.filter((m) => m.id !== EVENT_MERCHANT_ID)}
          onAddToCart={addToCart}
          loading={menusLoading}
        />

        {/* ────────────────────────────────────────────────────────────────
            STALL-BY-STALL MARKETPLACE & CART SECTION
        ──────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 items-start gap-6 ">
          {/* Main Stall Rows */}
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 px-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-700">
                  Find your next meal
                </p>
                <h2 className="mt-0.5 text-xl sm:text-2xl font-black text-slate-900">Browse Campus Stalls</h2>
              </div>
              <p className="text-xs text-slate-500">Scroll each row to see items</p>
            </div>

            {merchants.filter((m) => m.id !== EVENT_MERCHANT_ID).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No stalls are available right now.
              </div>
            ) : (
              merchants
                .filter((m) => m.id !== EVENT_MERCHANT_ID)
                .map((merchant) => {
                  const items = menuItemsByMerchant[merchant.id] ?? [];
                  return (
                    <section
                      key={merchant.id}
                      className="grid gap-3 sm:gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm md:grid-cols-[12rem_minmax(0,1fr)]"
                    >
                      {/* Stall Header / Info */}
                      <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
                            Shop / Stall
                          </p>
                          <h3 className="mt-0.5 text-base sm:text-lg font-bold leading-snug text-slate-900">
                            {merchant.name}
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">📍 {merchant.location || "Campus"}</p>
                        </div>
                        {merchant.description && (
                          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                            {merchant.description}
                          </p>
                        )}
                      </div>

                      {/* Horizontal Scrolling Items */}
                      <div className="min-w-0">
                        {menusLoading ? (
                          <p className="py-6 text-center text-xs text-slate-400">Loading menu…</p>
                        ) : items.length === 0 ? (
                          <p className="py-6 text-center text-xs text-slate-400">No menu items available yet.</p>
                        ) : (
                          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 hide-scrollbar">
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


        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────
          MOBILE FLOATING CART BOTTOM BAR (<lg)
          Visible whenever cart contains items on mobile
      ──────────────────────────────────────────────────────────────── */}
      {totalItemCount > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 z-40 bg-gradient-to-t from-slate-950/80 via-slate-950/60 to-transparent pointer-events-none">
          <div className="max-w-md mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(true)}
              className="w-full flex items-center justify-between gap-3 bg-[#F04B14] hover:bg-orange-700 text-white p-3.5 rounded-2xl shadow-xl transition active:scale-[0.98]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25 text-xs font-black">
                  {totalItemCount}
                </span>
                <div className="text-left">
                  <p className="text-xs font-semibold text-orange-100">
                    {cartMerchant?.name ?? "Order"}
                  </p>
                  <p className="text-sm font-black">RM {cartTotal.toFixed(2)}</p>
                </div>
              </div>

              <span className="flex items-center gap-1 text-xs font-bold bg-white text-[#F04B14] px-3.5 py-1.5 rounded-xl shadow-sm">
                View Cart & Checkout →
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────
          CART DRAWER (all screen sizes)
      ──────────────────────────────────────────────────────────────── */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          {/* Backdrop click to dismiss */}
          <div className="flex-1" onClick={() => setIsMobileCartOpen(false)} />

          {/* Drawer content */}
          <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-5 shadow-2xl border-t border-slate-200 max-h-[85vh] flex flex-col animate-slide-up">
            {/* Grab handle */}
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-slate-300" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Your Cart</h3>
                <p className="text-xs text-slate-500">
                  From: <strong>{cartMerchant?.name ?? "Campus Stall"}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileCartOpen(false)}
                className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Cart Items List */}
            {Object.keys(cart).length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-4xl mb-2">🛒</p>
                <p className="font-bold text-slate-800 text-sm">Your cart is currently empty</p>
                <p className="text-xs text-slate-500 mt-1">Tap +Add on any stall meal to begin your order.</p>
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen(false)}
                  className="mt-4 px-4 py-2 bg-orange-50 text-[#F04B14] font-bold text-xs rounded-xl hover:bg-orange-100 transition"
                >
                  Browse Campus Stalls
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 divide-y divide-slate-100">
                  {Object.values(cart).map(({ item, quantity }) => (
                    <div key={item.id} className="pt-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-slate-500">RM {Number(item.price).toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                        >
                          −
                        </button>
                        <span className="w-4 text-center font-bold text-sm">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pickup Slot & Checkout Area */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Pickup Slot
                    </label>
                    {pickupSlots.length === 0 ? (
                      <p className="text-xs text-red-600">No pickup slots available.</p>
                    ) : (
                      <select
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800"
                      >
                        {pickupSlots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {new Date(slot.time_slot).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            ({slot.current_bookings}/{slot.max_capacity} booked)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex justify-between items-center font-bold text-slate-900 pt-1">
                    <span className="text-sm">Total Amount</span>
                    <span className="text-lg text-[#F04B14]">RM {cartTotal.toFixed(2)}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={checkingOut || pickupSlots.length === 0}
                    className="w-full rounded-xl bg-[#F04B14] py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-orange-700 disabled:opacity-50"
                  >
                    {checkingOut ? "Redirecting to DuitNow..." : "Proceed to DuitNow Payment"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
