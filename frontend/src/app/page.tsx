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
import ShopDetailsDialog from "@/components/ShopDetailsDialog";
import RecommendationWidget from "@/components/RecommendationWidget";
import FoodDetailsDialog from "@/components/FoodDetailsDialog";

// ─── Type Definitions ────────────────────────────────────────────────────────

interface Merchant {
  id: string;
  name: string;
  description: string | null;
  location: string;
}

interface ActiveEvent {
  id: string;
  name: string;
  description?: string;
  banner_image_url?: string;
  event_url?: string;
  start_time: string;
  end_time: string;
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

type MenuLoadStatus = "loading" | "loaded" | "error";

interface CartLine {
  item: MenuItem;
  quantity: number;
  specialInstructions: string;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function Home() {
  // ── State: Merchants & Menus ──
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [eventMerchantIds, setEventMerchantIds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<ActiveEvent | null>(null);
  useEffect(() => {
    // Load the currently active event for the banner
    fetch(`${BACKEND_URL}/events`)
      .then(r => r.ok ? r.json() : [])
      .then((evs: ActiveEvent[]) => {
        const now = Date.now();
        const live = evs.find(e => new Date(e.start_time).getTime() <= now && new Date(e.end_time).getTime() >= now);
        setActiveEvent(live || null);
      })
      .catch(() => {});
    fetch(`${BACKEND_URL}/events/featured-merchants`).then(r => {
      if (!r.ok) throw new Error("Events unavailable");
      return r.json();
    }).then(rows => setEventMerchantIds(rows.map((m: Merchant) => m.id))).catch(() => {});
  }, []);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string | null>(null);
  const [menuItemsByMerchant, setMenuItemsByMerchant] = useState<Record<string, MenuItem[]>>({});
  const [menuStatusByMerchant, setMenuStatusByMerchant] = useState<Record<string, MenuLoadStatus>>({});

  // ── State: Pickup Slots ──
  const [pickupSlots, setPickupSlots] = useState<PickupSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");

  // ── State: Cart (single stall at a time) ──
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedShop, setSelectedShop] = useState<Merchant | null>(null);
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
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
        let res = await fetch(`${BACKEND_URL}/merchants/sorted`);
        if (!res.ok) res = await fetch(`${BACKEND_URL}/merchants`); // fallback before backend deploy
        if (res.ok) {
          const data: Merchant[] = await res.json();
          if (!Array.isArray(data) || data.some((merchant) => !merchant.id)) {
            throw new Error("The merchant response is missing required IDs.");
          }
          setMerchants(data);
          setMenuStatusByMerchant(Object.fromEntries(data.map((merchant) => [merchant.id, "loading"])));
          const shopId = new URLSearchParams(window.location.search).get("shop");
          if (shopId) setSelectedShop(data.find((m: Merchant) => m.id === shopId) ?? null);
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
    if (merchants.length === 0) return;

    let cancelled = false;
    const controllers = merchants.map(() => new AbortController());

    merchants.forEach(async (merchant, index) => {
      const controller = controllers[index];
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(`${BACKEND_URL}/merchants/${merchant.id}/items`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Menu request failed with ${response.status}`);
        const items: MenuItem[] = await response.json();
        if (!cancelled) {
          setMenuItemsByMerchant((current) => ({ ...current, [merchant.id]: items }));
          setMenuStatusByMerchant((current) => ({ ...current, [merchant.id]: "loaded" }));
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`Failed to load menu for ${merchant.name}`, error);
          setMenuItemsByMerchant((current) => ({ ...current, [merchant.id]: [] }));
          setMenuStatusByMerchant((current) => ({ ...current, [merchant.id]: "error" }));
        }
      } finally {
        window.clearTimeout(timeout);
      }
    });

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [merchants]);

  // ─── 5. Add to Cart Handler (with jumping animation & toast) ───────────────
  const addToCart = (item: MenuItem, specialInstructions = "") => {
    if (!item.is_available) return false;
    if (selectedMerchantId && selectedMerchantId !== item.merchant_id && Object.keys(cart).length > 0) {
      const currentMerchant = merchants.find((merchant) => merchant.id === selectedMerchantId);
      const nextMerchant = merchants.find((merchant) => merchant.id === item.merchant_id);
      const shouldSwitch = window.confirm(
        `Your cart has items from "${currentMerchant?.name ?? "another stall"}". Switching to "${nextMerchant?.name ?? "this stall"}" will clear it. Continue?`
      );
      if (!shouldSwitch) return false;
      setCart({});
    }

    const normalizedInstructions = specialInstructions.trim();
    const lineKey = `${item.id}::${normalizedInstructions}`;
    setSelectedMerchantId(item.merchant_id);
    setCart((prev) => {
      const current = prev[lineKey]?.quantity ?? 0;
      return {
        ...prev,
        [lineKey]: { item, quantity: current + 1, specialInstructions: normalizedInstructions },
      };
    });

    setIsCartBouncing(true);
    setIsProfileJumping(true);
    setTimeout(() => {
      setIsCartBouncing(false);
      setIsProfileJumping(false);
    }, 700);

    setToastMessage(`🛒 Added ${item.name}! Don't forget to check out at the cart.`);
    setTimeout(() => {
      setToastMessage((msg) => (msg?.includes(item.name) ? null : msg));
    }, 4000);
    return true;
  };

  // ─── 6. Remove from Cart Handler ──────────────────────────────────────────
  const removeFromCart = (lineKey: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[lineKey] && copy[lineKey].quantity > 1) {
        copy[lineKey] = { ...copy[lineKey], quantity: copy[lineKey].quantity - 1 };
      } else {
        delete copy[lineKey];
      }
      return copy;
    });
  };

  const increaseCartLine = (lineKey: string) => {
    setCart((prev) => prev[lineKey]
      ? { ...prev, [lineKey]: { ...prev[lineKey], quantity: prev[lineKey].quantity + 1 } }
      : prev);
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
  const menusLoading = useMemo(
    () => merchants.some((merchant) => !menuStatusByMerchant[merchant.id] || menuStatusByMerchant[merchant.id] === "loading"),
    [merchants, menuStatusByMerchant]
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
        items: Object.values(cart).map(({ item, quantity, specialInstructions }) => ({
          menu_item_id: item.id,
          quantity: quantity,
          special_instructions: specialInstructions || null,
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
    const savedSpiceLevel = desc.match(/Spiciness:\s*([^|\]\n]+)/i)?.[1]?.trim().toLowerCase();
    const hasSpicyWord = /\b(spicy|pedas|sambal|chili|chilli)\b/i.test(`${item.name} ${desc}`);
    const isExplicitlyNonSpicy = /\b(non[-\s]?spicy|not spicy|tidak pedas)\b/i.test(`${item.name} ${desc}`);
    const isSpicy = savedSpiceLevel
      ? !["non-spicy", "non spicy", "not spicy", "tidak pedas"].includes(savedSpiceLevel)
      : hasSpicyWord && !isExplicitlyNonSpicy;
    const isRahmah = Number(item.price) <= 5.0;

    return (
      <article
        role="button"
        tabIndex={0}
        aria-label={`View ${item.name} details and customise`}
        onClick={() => setSelectedMenuItem(item)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedMenuItem(item);
          }
        }}
        className="relative flex w-52 sm:w-60 shrink-0 snap-start cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-orange-600"
      >
        <div className="relative h-28 sm:h-36 w-full overflow-hidden bg-slate-100">
          {item.image_url ? (
            <img
              src={item.image_url.startsWith("/") ? `${BACKEND_URL}${item.image_url}` : item.image_url}
              alt={item.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl" aria-hidden="true">
              🍽️
            </div>
          )}

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
              onClick={(event) => {
                event.stopPropagation();
                setSelectedMenuItem(item);
              }}
              className="relative z-20 rounded-lg bg-[#F04B14] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-95"
            >
              {item.is_available ? "Customise" : "View"}
            </button>
          </div>
        </div>
      </article>
    );
  };

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
        <header className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-orange-100">
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
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
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

              {totalItemCount > 0 ? (
                <span className="ml-0.5 flex h-5 min-w-[20px] px-1.5 items-center justify-center rounded-full bg-white text-[#F04B14] text-[11px] font-black shadow-sm">
                  {totalItemCount}
                </span>
              ) : (
                <span className="text-slate-400 font-normal text-xs">(0)</span>
              )}
            </button>

            <Link
              href="/profile"
              className={`relative flex items-center gap-1.5 sm:gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition border border-slate-200 cursor-pointer ${
                isProfileJumping ? "animate-cart-bounce ring-4 ring-orange-300 bg-orange-100 text-orange-700" : ""
              }`}
              title="View your profile, photo & orders"
            >
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

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs sm:text-sm">
            {errorMessage}
          </div>
        )}

        {/* Dynamic event banner — only shows when an event is live */}
        {activeEvent && (
          <div className="relative overflow-hidden rounded-2xl shadow-md w-full text-white"
            style={activeEvent.banner_image_url
              ? { backgroundImage: `url(${activeEvent.banner_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(135deg, #5b21b6, #4338ca, #6d28d9)" }}>
            {/* Dark overlay for readability when poster is set */}
            {activeEvent.banner_image_url && <div className="absolute inset-0 bg-black/50" />}
            <div className="relative z-10 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img src="/payvolution-events.png" alt="Event" className="h-8 w-8 rounded-xl bg-white/20 p-1.5 object-contain backdrop-blur-sm" />
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Campus Pop-up</p>
                    <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">{activeEvent.name}</h2>
                  </div>
                </div>
                <div className="flex gap-2 self-start sm:self-auto">
                  {activeEvent.event_url && (
                    <Link href={activeEvent.event_url}
                      className="shrink-0 bg-white text-slate-900 text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition hover:bg-purple-50 shadow-sm">
                      Event Info →
                    </Link>
                  )}
                  <Link href="/events"
                    className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs sm:text-sm font-bold px-4 py-2 rounded-xl transition border border-white/30">
                    See all vendors →
                  </Link>
                </div>
              </div>
              <p className="mt-3 text-sm text-white/80">{activeEvent.description || "Meet the participating campus vendors and open any shop to see its real menu."}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {merchants.filter(m => eventMerchantIds.includes(m.id)).map(m => (
                  <button key={m.id} onClick={() => setSelectedShop(m)}
                    className="rounded-xl bg-white px-5 py-3 text-left text-slate-900 transition hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-white">
                    <span className="block font-bold">{m.name}</span>
                    <span className="text-xs text-slate-500">{m.location} · View shop</span>
                  </button>
                ))}
                {!merchants.some(m => eventMerchantIds.includes(m.id)) && (
                  <p className="rounded-xl bg-white/10 px-4 py-3 text-sm text-white/70">Event vendors will appear here when their shop is on board.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <RecommendationWidget
          items={allMenuItems}
          merchants={merchants}
          onAddToCart={setSelectedMenuItem}
          onViewItem={setSelectedMenuItem}
          loading={menusLoading}
        />

        <div className="grid grid-cols-1 items-start gap-6 ">
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

            {merchants.filter(m => !eventMerchantIds.includes(m.id)).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                No stalls are available right now.
              </div>
            ) : (
              merchants
                .filter((m) => !eventMerchantIds.includes(m.id))
                .map((merchant) => {
                  const items = menuItemsByMerchant[merchant.id] ?? [];
                  const menuStatus = menuStatusByMerchant[merchant.id] ?? "loading";
                  return (
                    <section
                      key={merchant.id}
                      className="grid gap-3 sm:gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm md:grid-cols-[12rem_minmax(0,1fr)]"
                    >
                      <div className="flex flex-col justify-between gap-2 border-b border-slate-100 pb-3 md:border-b-0 md:border-r md:pb-0 md:pr-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
                            Shop / Stall
                          </p>
                          <h3 className="mt-0.5 text-base sm:text-lg font-bold leading-snug text-slate-900">
                            <button type="button" onClick={() => setSelectedShop(merchant)} className="text-left hover:text-orange-700 focus-visible:outline-2 focus-visible:outline-orange-600" aria-label={`View ${merchant.name}`}>{merchant.name}</button>
                          </h3>
                          <p className="mt-1 text-xs text-slate-500">📍 {merchant.location || "Campus"}</p>
                        </div>
                        {merchant.description && (
                          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                            {merchant.description}
                          </p>
                        )}
                      </div>

                      <div className="min-w-0">
                        {menuStatus === "loading" ? (
                          <p className="py-6 text-center text-xs text-slate-400">Loading menu…</p>
                        ) : menuStatus === "error" ? (
                          <p role="status" className="py-6 text-center text-xs text-amber-700">
                            Menu is temporarily unavailable. Refresh to try again.
                          </p>
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

      {selectedShop && (
        <ShopDetailsDialog
          merchant={selectedShop}
          items={menuItemsByMerchant[selectedShop.id] || []}
          onClose={() => setSelectedShop(null)}
          onSelect={(item) => {
            setSelectedShop(null);
            setSelectedMenuItem(item);
          }}
        />
      )}
      {selectedMenuItem && (
        <FoodDetailsDialog
          key={selectedMenuItem.id}
          item={selectedMenuItem}
          merchant={merchants.find((merchant) => merchant.id === selectedMenuItem.merchant_id)}
          onClose={() => setSelectedMenuItem(null)}
          onAdd={(specialInstructions) => {
            if (addToCart(selectedMenuItem, specialInstructions)) {
              setSelectedMenuItem(null);
            }
          }}
        />
      )}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="flex-1" onClick={() => setIsMobileCartOpen(false)} />

          <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-5 shadow-2xl border-t border-slate-200 max-h-[85vh] flex flex-col animate-slide-up">
            <div className="mx-auto -mt-2 mb-3 h-1.5 w-12 rounded-full bg-slate-300" />

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
                  {Object.entries(cart).map(([lineKey, { item, quantity, specialInstructions }]) => (
                    <div key={lineKey} className="pt-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-slate-500">RM {Number(item.price).toFixed(2)} each</p>
                        {specialInstructions && (
                          <p className="mt-1 max-w-xs text-[11px] leading-snug text-orange-700">{specialInstructions}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => removeFromCart(lineKey)}
                          className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                        >
                          −
                        </button>
                        <span className="w-4 text-center font-bold text-sm">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => increaseCartLine(lineKey)}
                          className="h-7 w-7 rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                      Pickup Slot
                    </label>
                    {(() => {
                      // Customers only see slots that aren't full yet
                      const availableSlots = pickupSlots.filter(s => s.current_bookings < s.max_capacity);
                      if (availableSlots.length === 0) return <p className="text-xs text-red-600">No pickup slots available right now.</p>;
                      return (
                        <select
                          value={selectedSlotId}
                          onChange={(e) => setSelectedSlotId(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800"
                        >
                          {availableSlots.map((slot) => (
                            <option key={slot.id} value={slot.id}>
                              {new Date(slot.time_slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              {" "}({slot.current_bookings}/{slot.max_capacity} booked)
                            </option>
                          ))}
                        </select>
                      );
                    })()}
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
