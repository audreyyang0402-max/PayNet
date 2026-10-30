"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
import { isDisplayableFood } from "@/lib/menu-visibility";

// ---------------------------------------------------------------------------
// Types – kept compatible with the existing props contract
// ---------------------------------------------------------------------------

interface RecommendationItem {
  id: string;
  merchant_id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  image_url?: string | null;
}

interface RecommendationMerchant {
  id: string;
  name: string;
}

interface RecommendationWidgetProps {
  items: RecommendationItem[];
  merchants: RecommendationMerchant[];
  onViewItem?: (item: RecommendationItem) => void;
  onAddToCart: (item: RecommendationItem) => void;
  loading: boolean;
}

// ---------------------------------------------------------------------------
// Tab definitions – each tab has a unique key, emoji, label, and helper text
// ---------------------------------------------------------------------------

type TabKey = "hot-deals" | "budget" | "rahmah" | "not-spicy" | "popular";

interface TabDefinition {
  key: TabKey;
  emoji: string;
  label: string;
  helper: string;
}

const TABS: TabDefinition[] = [
  { key: "hot-deals", emoji: "🔥", label: "Hot Deals",       helper: "Best value picks" },
  { key: "budget",    emoji: "💰", label: "Budget Friendly", helper: "Under RM 10" },
  { key: "rahmah",    emoji: "🍚", label: "RM5 Rahmah",      helper: "Makanan Rahmah RM5 & below" },
  { key: "not-spicy", emoji: "🌶️", label: "Not Spicy",       helper: "Mild & gentle flavours" },
  { key: "popular", emoji: "⭐", label: "Campus favourites", helper: "Most ordered across campus · completed orders in the last 30 days" },
];

// ---------------------------------------------------------------------------
// Spice-detection regex — matches common spicy keywords in Malay & English
// ---------------------------------------------------------------------------

const SPICY_PATTERN = /spicy|chili|chilli|sambal|pedas|hot\s*sauce/i;

// Brand colour constant (PayNet orange)
const BRAND_ORANGE = "#F04B14";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecommendationWidget({
  items,
  merchants,
  onAddToCart,
  onViewItem,
  loading,
}: RecommendationWidgetProps) {
  // Activated by user click/tap – collapsed by default
  const [isOpen, setIsOpen] = useState(false);

  const [popular, setPopular] = useState<{id: string; quantity: number}[]>([]);
  const [popularityError, setPopularityError] = useState("");
  const [popularityLoading, setPopularityLoading] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setPopularityLoading(true);
    fetch(`${BACKEND_URL}/recommendations/items?limit=100`, { signal: controller.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("Campus favourites are temporarily unavailable."); return r.json(); })
      .then(rows => { setPopular(rows); setPopularityError(""); })
      .catch(e => { if (!controller.signal.aborted) setPopularityError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setPopularityLoading(false); });
    return () => controller.abort();
  }, [isOpen]);
  // Active tab – defaults to "hot-deals"
  const [activeTab, setActiveTab] = useState<TabKey>("popular");

  // Ref for the tab bar so we can auto-scroll the active pill into view
  const tabBarRef = useRef<HTMLDivElement>(null);

  // -------------------------------------------------------------------------
  // Derived: only available items + price-sorted list for deal cutoff calc
  // -------------------------------------------------------------------------

  const availableItems = useMemo(
    () => items.filter((item) => item.is_available && isDisplayableFood(item)),
    [items],
  );

  // 25th-percentile price threshold for "Hot Deals"
  const dealCutoff = useMemo(() => {
    const sorted = availableItems
      .map((item) => Number(item.price))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.25) - 1)];
  }, [availableItems]);

  // -------------------------------------------------------------------------
  // Filter logic keyed by active tab
  // -------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    let result: RecommendationItem[];

    switch (activeTab) {
      case "hot-deals":
        // Cheapest 25% of available items
        result = availableItems.filter(
          (item) => Number(item.price) <= dealCutoff,
        );
        break;

      case "budget":
        // Items under RM 10
        result = availableItems.filter((item) => Number(item.price) < 10);
        break;

      case "rahmah":
        // Rahmah Madani — RM 5 and below
        result = availableItems.filter((item) => Number(item.price) <= 5);
        break;

      case "not-spicy":
        // Exclude items whose name or description contains spicy keywords
        result = availableItems.filter((item) => {
          const text = `${item.name} ${item.description ?? ""}`.toLowerCase();
          return /\b(mild|not spicy|non-spicy|tidak pedas)\b/i.test(text);
        });
        break;

      case "popular":
        return popular.flatMap(rank => { const item = availableItems.find(item => item.id === rank.id); return item ? [item] : []; });
      default:
        result = [];
        break;
    }

    // Always sort by price ascending
    return result.sort((a, b) => Number(a.price) - Number(b.price));
  }, [activeTab, availableItems, dealCutoff, popular]);

  // -------------------------------------------------------------------------
  // Auto-scroll the active tab pill into view on mobile
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!tabBarRef.current) return;
    const activeButton = tabBarRef.current.querySelector<HTMLButtonElement>(
      `[data-tab="${activeTab}"]`,
    );
    activeButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeTab]);

  // -------------------------------------------------------------------------
  // Helper: look up merchant name by id
  // -------------------------------------------------------------------------

  const merchantName = (merchantId: string): string => {
    return merchants.find((m) => m.id === merchantId)?.name ?? "Campus stall";
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm transition-all">
      {isOpen && activeTab === "popular" && <p role="status" className="px-5 pt-3 text-xs text-slate-600">{popularityError || (popularityLoading ? "Loading campus favourites…" : "Based on quantities in completed orders, not paid promotions.")}</p>}
      {/* ================================================================
          Interactive Click-to-Activate Header Banner
          Requires user click/tap before opening recommendations
          ================================================================ */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-4 sm:px-6 py-4 text-left text-white transition hover:from-orange-700 hover:to-amber-600 cursor-pointer"
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span>✨ Recommended For You</span>
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-orange-100">
            {isOpen
              ? "Tap to hide recommendation categories"
              : "Tap here to explore budget meals, hot deals & preferences"}
          </p>
        </div>

        <span className="shrink-0 rounded-xl bg-white/20 hover:bg-white/30 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white transition border border-white/25 flex items-center gap-1.5">
          <span>{isOpen ? "Close" : "Explore"}</span>
          <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>

      {/* ================================================================
          Content area – only revealed after clicking / activating
          ================================================================ */}
      {isOpen && (
        <div className="pt-2 animate-slide-up">
          {/* Horizontal scrollable tab bar */}
          <div
            ref={tabBarRef}
            className="flex gap-2 overflow-x-auto scroll-smooth px-4 py-3 snap-x sm:px-6 hide-scrollbar"
            role="tablist"
            aria-label="Recommendation categories"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  data-tab={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.key)}
                  className={`
                    flex shrink-0 snap-start items-center gap-1.5 rounded-full
                    px-4 py-2 text-sm font-semibold whitespace-nowrap
                    transition-all duration-200 cursor-pointer
                    ${
                      isActive
                        ? "text-white shadow-md"
                        : "border border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50"
                    }
                  `}
                  style={isActive ? { backgroundColor: BRAND_ORANGE } : undefined}
                >
                  <span className="text-base">{tab.emoji}</span>
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active tab helper text */}
          <p className="px-5 pb-2 text-xs text-slate-500 sm:px-6">
            {TABS.find((t) => t.key === activeTab)?.helper}
          </p>

          <div className="px-4 pb-5 sm:px-6 sm:pb-6">
            {/* Contextual disclaimers / notes shown for specific tabs */}
            {activeTab === "not-spicy" && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                🌶️ Spice matching uses keywords in the item name and description.
                Please double-check with the stall if you have a serious spice
                sensitivity.
              </p>
            )}

            {activeTab === "rahmah" && (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                🍚 <strong>Menu Rahmah Madani</strong> — Affordable meals at RM 5 &amp;
                below, supporting the Malaysian government&apos;s initiative for
                accessible food.
              </p>
            )}

            {activeTab === "hot-deals" && availableItems.length > 0 && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                🔥 Hot Deals highlights the cheapest 25% of available items (at or
                below RM&nbsp;{dealCutoff.toFixed(2)}).
              </p>
            )}

            {/* Loading state */}
            {loading && (
              <div className="rounded-xl bg-slate-50 p-8 text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
                <p className="text-sm text-slate-500">
                  Loading menu recommendations…
                </p>
              </div>
            )}

            {/* Empty state */}
            {!loading && filteredItems.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-8 text-center">
                <p className="text-3xl">🍽️</p>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  No items match this category right now
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try another tab — there might be something tasty elsewhere!
                </p>
              </div>
            )}

            {/* Item grid */}
            {!loading && filteredItems.length > 0 && (
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    className="relative group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                  >

                    {item.image_url && (
                      <img
                        src={item.image_url.startsWith("/") ? BACKEND_URL + item.image_url : item.image_url}
                        alt={item.name}
                        loading="lazy"
                        className="h-32 w-full object-cover sm:h-36"
                      />
                    )}

                    <div className="flex flex-1 flex-col p-3 sm:p-4">
                      <p className="text-xs font-medium text-orange-700">
                        {merchantName(item.merchant_id)}
                      </p>

                      <h3 className="mt-1 text-sm font-bold leading-snug text-slate-900">
                        {item.name}
                      </h3>

                      <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-slate-500">
                        {item.description || "A fresh pick from your campus stalls."}
                      </p>

                      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                        <span className="text-sm font-bold text-slate-900">
                          RM&nbsp;{Number(item.price).toFixed(2)}
                        </span>

                        <button
                          type="button"
                          onClick={() => onAddToCart(item)}
                          className="relative z-20 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 cursor-pointer"
                          style={{ backgroundColor: BRAND_ORANGE }}
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                          Add to cart
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
