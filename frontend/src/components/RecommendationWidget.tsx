"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
import { isDisplayableFood } from "@/lib/menu-visibility";
import { customerPrice, offerIsActive } from "@/lib/promotions";
import { EMPTY_FILTERS, matchesFilters, metadata, type DiscoveryItem, type DiscoveryMerchant, type MenuFilters } from "@/lib/menu-filters";
import { parseMenuDescription } from "@/lib/menu-customizations";
import OfferPrice from "./OfferPrice";

<<<<<<< HEAD
const TABS = [
  ["all", "🍽️", "Browse all"], ["deals", "🏷️", "Deals & Discounts"],
  ["value", "✨", "Best Value"], ["budget", "💰", "Under RM10"],
  ["rahmah", "🍚", "RM5 & Below"], ["not-spicy", "🌱", "Not Spicy"],
  ["popular", "⭐", "Campus Favourites"],
=======
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
>>>>>>> d548db963297557c72099f8a40145a2866c50b3d
];
const control = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

<<<<<<< HEAD
export default function RecommendationWidget({ items, merchants, onViewItem, onAddToCart, loading }: {
  items: DiscoveryItem[]; merchants: DiscoveryMerchant[]; onViewItem?: (item: DiscoveryItem) => void;
  onAddToCart: (item: DiscoveryItem) => void; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [filters, setFilters] = useState<MenuFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState("popular");
  const [popular, setPopular] = useState<{ id: string; quantity: number }[]>([]);
  const [pickupIds, setPickupIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(() => Date.now());
  const [showFilters, setShowFilters] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

=======
const BRAND_ORANGE = "#F04B14";

export default function RecommendationWidget({
  items,
  merchants,
  onAddToCart,
  onViewItem,
  loading,
}: RecommendationWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [popular, setPopular] = useState<{id: string; quantity: number}[]>([]);
  const [popularityError, setPopularityError] = useState("");
  const [popularityLoading, setPopularityLoading] = useState(false);
>>>>>>> d548db963297557c72099f8a40145a2866c50b3d
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
<<<<<<< HEAD
    Promise.all([
      fetch(`${BACKEND_URL}/recommendations/items?limit=100`, { signal: controller.signal, cache: "no-store" }),
      fetch(`${BACKEND_URL}/recommendations/pickup-availability`, { signal: controller.signal, cache: "no-store" }),
    ]).then(async ([ranks, slots]) => {
      if (!ranks.ok || !slots.ok) throw new Error("Popularity or pickup filters could not refresh. Other menu filters are still available.");
      const [ranked, ids] = await Promise.all([ranks.json(), slots.json()]);
      if (!controller.signal.aborted) { setPopular(ranked); setPickupIds(ids); setError(""); }
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingRanks(false); });
    const timer = setInterval(() => setClock(Date.now()), 15000);
    const refresh = setInterval(() => { if (!document.hidden) setRetry((r) => r + 1); }, 60000);
    return () => { controller.abort(); clearInterval(timer); clearInterval(refresh); };
  }, [open, retry]);
=======
    fetch(`${BACKEND_URL}/recommendations/items?limit=100`, { signal: controller.signal, cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("Campus favourites are temporarily unavailable."); return r.json(); })
      .then(rows => { setPopular(rows); setPopularityError(""); })
      .catch(e => { if (!controller.signal.aborted) setPopularityError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setPopularityLoading(false); });
    return () => controller.abort();
  }, [isOpen]);
  const [activeTab, setActiveTab] = useState<TabKey>("popular");

  const tabBarRef = useRef<HTMLDivElement>(null);

  const availableItems = useMemo(
    () => items.filter((item) => item.is_available && isDisplayableFood(item)),
    [items],
  );

  // Use the lowest price quartile of visible menu items for this category.
  const dealCutoff = useMemo(() => {
    const sorted = availableItems
      .map((item) => Number(item.price))
      .sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.25) - 1)];
  }, [availableItems]);

  const availableItemsById = useMemo(
    () => new Map(availableItems.map((item) => [item.id, item])),
    [availableItems],
  );

  const filteredItems = useMemo(() => {
    let result: RecommendationItem[];

    switch (activeTab) {
      case "hot-deals":
        result = availableItems.filter(
          (item) => Number(item.price) <= dealCutoff,
        );
        break;

      case "budget":
        result = availableItems.filter((item) => Number(item.price) < 10);
        break;

      case "rahmah":
        result = availableItems.filter((item) => Number(item.price) <= 5);
        break;

      case "not-spicy":
        result = availableItems.filter((item) => {
          const text = `${item.name} ${item.description ?? ""}`.toLowerCase();
          return /\b(mild|not spicy|non-spicy|tidak pedas)\b/i.test(text);
        });
        break;

      case "popular":
        return popular.flatMap((rank) => {
          const item = availableItemsById.get(rank.id);
          return item ? [item] : [];
        });
      default:
        result = [];
        break;
    }

    return result.sort((a, b) => Number(a.price) - Number(b.price));
  }, [activeTab, availableItems, availableItemsById, dealCutoff, popular]);
>>>>>>> d548db963297557c72099f8a40145a2866c50b3d

  useEffect(() => {
    if (!showFilters) return;
    const node = dialog.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = previous; };
  }, [showFilters]);

<<<<<<< HEAD
  const available = useMemo(() => items.filter((item) => item.is_available && isDisplayableFood(item)).map((item) => customerPrice(item, clock)), [items, clock]);
  const categories = [...new Set(available.map((item) => metadata(item, "Category")).filter(Boolean))].sort();
  const locations = [...new Set(merchants.map((m) => m.location || "").filter(Boolean))].sort();
  const ranked = new Map(popular.map((item) => [item.id, item.quantity]));
  const prices = available.map((item) => Number(item.price)).sort((a, b) => a - b);
  const cutoff = prices[Math.max(0, Math.ceil(prices.length * .25) - 1)] || 0;
  const filtered = available.filter((item) => {
    const spice = metadata(item, "Spiciness").toLowerCase();
    const tabMatches = tab === "all" || tab === "deals" && offerIsActive(item.promotion)
      || tab === "value" && item.price <= cutoff || tab === "budget" && item.price < 10
      || tab === "rahmah" && item.price <= 5 || tab === "popular" && ranked.has(item.id)
      || tab === "not-spicy" && ["non-spicy", "non spicy", "not spicy"].includes(spice);
    return tabMatches && matchesFilters(item, filters, merchants, pickupIds);
  }).sort((a, b) => {
    if (sort === "low") return a.price - b.price || a.name.localeCompare(b.name);
    if (sort === "high") return b.price - a.price || a.name.localeCompare(b.name);
    if (sort === "discount") {
      const saving = (i: DiscoveryItem) => offerIsActive(i.promotion) ? 1 - i.price / (i.original_price || i.price) : 0;
      return saving(b) - saving(a) || a.price - b.price;
    }
    return (ranked.get(b.id) || 0) - (ranked.get(a.id) || 0) || a.price - b.price || a.name.localeCompare(b.name);
  });
  const update = <K extends keyof MenuFilters>(key: K, value: MenuFilters[K]) => setFilters((f) => ({ ...f, [key]: value }));
  const toggle = (key: "categories" | "merchants" | "dietary", value: string) => update(key, filters[key].includes(value) ? filters[key].filter((v) => v !== value) : [...filters[key], value]);
  const chips: { label: string; remove: () => void }[] = [];
  if (filters.query) chips.push({ label: `Search: ${filters.query}`, remove: () => update("query", "") });
  if (filters.min) chips.push({ label: `From RM${filters.min}`, remove: () => update("min", "") });
  if (filters.max) chips.push({ label: `Up to RM${filters.max}`, remove: () => update("max", "") });
  for (const key of ["categories", "merchants", "dietary"] as const) for (const value of filters[key]) chips.push({ label: key === "merchants" ? merchants.find((m) => m.id === value)?.name || value : value, remove: () => toggle(key, value) });
  if (filters.location) chips.push({ label: filters.location, remove: () => update("location", "") });
  if (filters.spice) chips.push({ label: { not: "Not spicy", mild: "Mild", spicy: "Spicy" }[filters.spice] || filters.spice, remove: () => update("spice", "") });
  for (const [key, label] of [["deals", "Discounts only"], ["customizable", "Spice choices"], ["pickup", "Pickup available"]] as const) if (filters[key]) chips.push({ label, remove: () => update(key, false) });
  const checkGroup = (label: string, key: "categories" | "merchants" | "dietary", entries: { value: string; label: string }[]) => <fieldset className="space-y-2"><legend className="mb-2 text-sm font-bold">{label}</legend><div className="flex flex-wrap gap-2">{entries.map((entry) => <label key={entry.value} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${filters[key].includes(entry.value) ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200"}`}><input type="checkbox" checked={filters[key].includes(entry.value)} onChange={() => toggle(key, entry.value)} />{entry.label}</label>)}</div></fieldset>;

  return <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-5 text-left text-white sm:px-6">
      <span><span className="block text-lg font-bold">✨ Recommended For You</span><span className="mt-1 block text-sm text-orange-50">Find your next meal, your way</span></span>
      <span className="rounded-xl border border-white/30 bg-white/20 px-4 py-2 text-sm font-bold">{open ? "Close ▲" : "Explore ▼"}</span>
    </button>
    {open && <div className="space-y-4 p-4 sm:p-6">
      <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Meal discovery categories">{TABS.map(([key, icon, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`shrink-0 rounded-full border px-4 py-2.5 text-sm font-semibold ${tab === key ? "border-orange-600 bg-orange-600 text-white shadow-sm" : "border-slate-200 text-slate-600 hover:bg-orange-50"}`}>{icon} {label}</button>)}</div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-40 flex-1"><span className="sr-only">Search dishes or stalls</span><input type="search" value={filters.query} onChange={(e) => update("query", e.target.value)} placeholder="Search dishes or stalls…" className={`${control} w-full`} /></label>
        <button type="button" className={`${control} font-semibold`} onClick={() => setShowFilters(true)}>Filters{chips.length ? ` (${chips.length})` : ""}</button>
        <label><span className="sr-only">Sort dishes</span><select value={sort} onChange={(e) => setSort(e.target.value)} className={control}><option value="popular">Most popular</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="discount">Largest % discount</option></select></label>
      </div>
      {chips.length > 0 && <div className="flex flex-wrap items-center gap-2">{chips.map((chip, i) => <button key={`${chip.label}:${i}`} type="button" onClick={chip.remove} aria-label={`Remove ${chip.label} filter`} className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800">{chip.label} ×</button>)}<button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-semibold text-slate-600 underline">Clear filters</button></div>}
      {error && <p role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{error} <button type="button" onClick={() => setRetry((r) => r + 1)} className="font-bold underline">Retry</button></p>}
      <p className="text-xs text-slate-500">{tab === "value" ? `Best Value: dishes at or below RM${cutoff.toFixed(2)}, the lowest-quarter price threshold.` : tab === "popular" ? "Ranked by units in completed orders over the last 30 days." : tab === "deals" ? "Active merchant discounts. Final prices are checked again at checkout." : "Filter available dishes by what matters to you."}</p>
      <p role="status" className="text-sm font-semibold text-slate-700">{loading || tab === "popular" && loadingRanks ? "Loading dishes…" : `${filtered.length} dishes found`}</p>
      {!loading && !filtered.length && <div className="rounded-2xl bg-orange-50/60 p-8 text-center"><p className="font-bold">No matching dishes yet</p><p className="mt-2 text-sm text-slate-500">Try another category or widen your filters.</p><button type="button" className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => { setFilters(EMPTY_FILTERS); setTab("all"); }}>Show all dishes</button></div>}
      {!loading && <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 lg:grid-cols-3">{filtered.map((item) => <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
        <button type="button" onClick={() => onViewItem?.(item)} className="relative text-left focus-visible:outline-2 focus-visible:outline-orange-600" aria-label={`View ${item.name}`}>
          {item.image_url && <img src={item.image_url.startsWith("/") ? BACKEND_URL + item.image_url : item.image_url} alt="" loading="lazy" className="h-36 w-full object-cover sm:h-44" />}
          {offerIsActive(item.promotion) && <span className="absolute left-3 top-3 max-w-[90%] truncate rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-bold text-white">{item.promotion!.name}</span>}
          <span className="block px-4 pt-3 text-xs font-semibold text-orange-700">{merchants.find((m) => m.id === item.merchant_id)?.name || "Campus stall"}</span>
          <span className="mt-1 block px-4 text-sm font-bold text-slate-900">{item.name}</span>
          <span className="mx-4 mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-slate-500">{parseMenuDescription(item.description).description || "View dish details and options."}</span>
        </button>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 p-4"><OfferPrice item={item} /><button type="button" onClick={() => onAddToCart(item)} className="rounded-xl bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">Customise</button></div>
      </article>)}</div>}
    </div>}
    {showFilters && <dialog ref={dialog} aria-labelledby="discovery-filter-title" onCancel={() => setShowFilters(false)} onClose={() => setShowFilters(false)} onClick={(e) => { if (e.target === e.currentTarget) setShowFilters(false); }} className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/50 md:inset-y-0 md:left-auto md:right-0 md:max-h-screen md:w-[440px] md:rounded-none">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-5"><h2 id="discovery-filter-title" className="text-lg font-bold">Find your meal</h2><button autoFocus type="button" aria-label="Close filters" onClick={() => setShowFilters(false)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xl">×</button></div>
      <div className="space-y-6 p-5">
        <fieldset><legend className="mb-2 text-sm font-bold">Budget (RM)</legend><div className="grid grid-cols-2 gap-2"><label className="text-xs">Minimum<input type="number" min="0" step="0.5" value={filters.min} onChange={(e) => update("min", e.target.value)} className={`${control} mt-1 w-full`} /></label><label className="text-xs">Maximum<input type="number" min="0" step="0.5" value={filters.max} onChange={(e) => update("max", e.target.value)} className={`${control} mt-1 w-full`} /></label></div>{filters.min && filters.max && Number(filters.min) > Number(filters.max) && <p role="alert" className="mt-2 text-xs text-red-600">Maximum must be at least the minimum.</p>}</fieldset>
        {checkGroup("Food categories", "categories", categories.map((v) => ({ value: v, label: v })))}
        {checkGroup("Stalls", "merchants", merchants.map((m) => ({ value: m.id, label: m.name })))}
        <label className="block text-sm font-bold">Location<select value={filters.location} onChange={(e) => update("location", e.target.value)} className={`${control} mt-2 w-full`}><option value="">All locations</option>{locations.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label className="block text-sm font-bold">Dish spiciness<select value={filters.spice} onChange={(e) => update("spice", e.target.value)} className={`${control} mt-2 w-full`}><option value="">Any spiciness</option><option value="not">Not spicy</option><option value="mild">Mild</option><option value="spicy">Spicy</option></select></label>
        {checkGroup("Dietary preferences", "dietary", ["Halal", "Vegetarian", "Vegan", "Gluten-Free"].map((v) => ({ value: v, label: v })))}
        <p className="text-xs text-slate-500">Dietary and spice filters use merchant-declared menu attributes. Items without that information won’t match.</p>
        <div className="space-y-3">{([["deals", "Active discounts only"], ["customizable", "Spice customisation available"], ["pickup", "Upcoming pickup slots available"]] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters[key]} onChange={(e) => update(key, e.target.checked)} />{label}</label>)}</div>
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t bg-white p-5"><button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="rounded-xl border px-4 py-3 text-sm font-semibold">Reset</button><button type="button" onClick={() => setShowFilters(false)} className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white">Show {filtered.length} dishes</button></div>
    </dialog>}
  </section>;
=======
  const merchantName = (merchantId: string): string => {
    return merchants.find((m) => m.id === merchantId)?.name ?? "Campus stall";
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm transition-all">

      <button
        type="button"
        onClick={() => {
          if (!isOpen) setPopularityLoading(true);
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500 px-4 sm:px-6 py-4 text-left text-white transition hover:from-orange-700 hover:to-amber-600 cursor-pointer"
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span>Recommended For You</span>
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-orange-100">
            {isOpen
              ? "Hide categories"
              : "Browse meals by price, popularity and preference"}
          </p>
        </div>

        <span className="shrink-0 rounded-xl bg-white/20 hover:bg-white/30 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold text-white transition border border-white/25 flex items-center gap-1.5">
          <span>{isOpen ? "Close" : "Explore"}</span>
          <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>

      {isOpen && (
        <div className="pt-2 animate-slide-up">
          {activeTab === "popular" && (popularityError || popularityLoading) && <p role="status" className="px-5 pt-3 text-xs text-slate-600">{popularityError || "Loading campus favourites…"}</p>}
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

          <p className="px-5 pb-2 text-xs text-slate-500 sm:px-6">
            {TABS.find((t) => t.key === activeTab)?.helper}
          </p>

          <div className="px-4 pb-5 sm:px-6 sm:pb-6">
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

            {loading && (
              <div className="rounded-xl bg-slate-50 p-8 text-center">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600" />
                <p className="text-sm text-slate-500">
                  Loading menu recommendations…
                </p>
              </div>
            )}

            {!loading && filteredItems.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-8 text-center">
                <p className="text-3xl">🍽️</p>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  No items match this category right now
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try another category.
                </p>
              </div>
            )}

            {!loading && filteredItems.length > 0 && (
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-3">
                {filteredItems.map((item) => (
                  <article
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onViewItem?.(item)}
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && onViewItem) {
                        event.preventDefault();
                        onViewItem(item);
                      }
                    }}
                    className="relative group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-orange-600"
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
                          onClick={(event) => {
                            event.stopPropagation();
                            onAddToCart(item);
                          }}
                          className="relative z-20 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95 cursor-pointer"
                          style={{ backgroundColor: BRAND_ORANGE }}
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
                          Customise
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
>>>>>>> d548db963297557c72099f8a40145a2866c50b3d
}
