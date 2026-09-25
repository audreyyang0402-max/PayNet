// src/components/RecommendationWidget.tsx
"use client";

import { useEffect, useState } from "react";

interface RecommendedItem {
  id: string;
  name: string;
  description: string;
  price: number;
  tag: string;
}

export default function RecommendationWidget() {
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const res = await fetch("http://127.0.0.1:8000/recommendations/items?limit=3");
        if (res.ok) {
          const data = await res.json();
          setItems(data);
        }
      } catch (err) {
        console.error("Failed to load recommendations", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRecommendations();
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-6 rounded-2xl text-white shadow-md space-y-4 my-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold">✨ Recommended For You</h3>
        <span className="text-xs bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider font-semibold">
          AI Smart Picks
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 space-y-2">
            <span className="text-xs bg-white text-orange-600 font-bold px-2 py-0.5 rounded-md">
              {item.tag}
            </span>
            <h4 className="font-bold text-base">{item.name}</h4>
            <p className="text-xs text-orange-100 line-clamp-2">{item.description}</p>
            <div className="flex justify-between items-center pt-2">
              <span className="font-bold text-sm">RM {item.price.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}