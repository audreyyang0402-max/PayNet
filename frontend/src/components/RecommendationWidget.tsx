"use client";

import { useState } from "react";

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

type Preference = "budget" | "not-spicy" | "deals";

const OPTIONS: { id: Preference; label: string; helper: string }[] = [
  { id: "budget", label: "Budget friendly", helper: "RM 12 or less" },
  { id: "not-spicy", label: "Not spicy", helper: "Avoid spicy menu words" },
  { id: "deals", label: "Hot deals", helper: "Show the lowest-priced picks" },
];

export default function RecommendationWidget({
  items,
  merchants,
  onAddToCart,
  loading,
}: {
  items: RecommendationItem[];
  merchants: RecommendationMerchant[];
  onAddToCart: (item: RecommendationItem) => void;
  loading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [preferences, setPreferences] = useState<Preference[]>([]);

  const availableItems = items.filter((item) => item.is_available);
  const prices = availableItems.map((item) => Number(item.price)).sort((a, b) => a - b);
  const dealCutoff = prices.length === 0 ? 0 : prices[Math.max(0, Math.ceil(prices.length * 0.25) - 1)];
  const matches = availableItems
    .filter((item) => {
      const details = `${item.name} ${item.description ?? ""}`.toLowerCase();
      if (preferences.includes("budget") && Number(item.price) > 12) return false;
      if (preferences.includes("not-spicy") && /spicy|chili|chilli|sambal|pedas|hot sauce/.test(details)) return false;
      if (preferences.includes("deals") && Number(item.price) > dealCutoff) return false;
      return true;
    })
    .sort((a, b) => Number(a.price) - Number(b.price))
    .slice(0, 6);

  const togglePreference = (preference: Preference) => {
    setPreferences((current) => current.includes(preference)
      ? current.filter((item) => item !== preference)
      : [...current, preference]);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls="recommendation-preferences"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-4 bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-4 text-left text-white transition hover:from-orange-700 hover:to-amber-600 sm:px-6"
      >
        <span>
          <span className="block text-lg font-bold">✨ Recommended For You</span>
          <span className="mt-1 block text-sm text-orange-50">Tell us what you feel like eating today.</span>
        </span>
        <span className="shrink-0 rounded-full bg-white/20 px-4 py-2 text-sm font-semibold">
          {isOpen ? "Close" : "Choose preferences"}
        </span>
      </button>

      {isOpen && <div id="recommendation-preferences" className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="font-bold text-slate-900">What are you looking for?</h2>
          <p className="mt-1 text-sm text-slate-500">Choose one or more preferences to narrow your picks.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          {OPTIONS.map((option) => {
            const selected = preferences.includes(option.id);
            return <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => togglePreference(option.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${selected ? "border-orange-600 bg-orange-50 ring-2 ring-orange-100" : "border-slate-200 bg-white hover:border-orange-300"}`}
            >
              <span className="block text-sm font-semibold text-slate-900">{selected ? "✓ " : ""}{option.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{option.helper}</span>
            </button>;
          })}
          {preferences.length > 0 && <button
            type="button"
            onClick={() => setPreferences([])}
            className="px-3 py-2 text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-slate-900"
          >
            Clear choices
          </button>}
        </div>

        {preferences.includes("not-spicy") && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Spice matching uses words in the item name and description. Please check with the stall if you have a serious spice sensitivity.
        </p>}
        {preferences.includes("deals") && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The menu doesn’t currently store discount prices, so Hot deals highlights the lowest-priced quarter of available items.
        </p>}

        {loading ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Loading menu recommendations…</p> : matches.length === 0 ? <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
          No items match those choices right now. Try clearing one preference.
        </p> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((item) => {
            const merchant = merchants.find((store) => store.id === item.merchant_id);
            return <article key={item.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
              {item.image_url && <img src={item.image_url} alt={item.name} className="mb-3 h-32 w-full rounded-lg object-cover" />}
              <p className="text-xs font-medium text-orange-700">{merchant?.name ?? "Campus stall"}</p>
              <h3 className="mt-1 font-bold text-slate-900">{item.name}</h3>
              <p className="mt-1 line-clamp-2 min-h-9 text-xs text-slate-500">{item.description || "A fresh pick from your campus stalls."}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="font-bold text-slate-900">RM {Number(item.price).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => onAddToCart(item)}
                  className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-700"
                >
                  Add to cart
                </button>
              </div>
            </article>;
          })}
        </div>}
      </div>}
    </section>
  );
}
