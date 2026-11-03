"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BackLink from "@/components/BackLink";
import FoodDetailsDialog from "@/components/FoodDetailsDialog";
import { BACKEND_URL } from "@/lib/backend-url";

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

interface CartLine {
  item: MenuItem;
  quantity: number;
  specialInstructions: string;
}

export default function MerchantMenuPage() {
  const params = useParams();
  const id = params?.id as string;

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [toast, setToast] = useState("");
  const [imageFailed, setImageFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      fetch(`${BACKEND_URL}/merchants/${id}`).then(r => r.ok ? r.json() : null),
      fetch(`${BACKEND_URL}/merchants/${id}/items`).then(r => r.ok ? r.json() : []),
    ])
      .then(([m, itms]) => {
        setMerchant(m);
        setItems(Array.isArray(itms) ? itms : []);
      })
      .catch(() => setError("Could not load this store's menu."))
      .finally(() => setLoading(false));
  }, [id]);

  const addToCart = (item: MenuItem, specialInstructions: string) => {
    setCart(prev => {
      const existing = prev.find(l => l.item.id === item.id && l.specialInstructions === specialInstructions);
      if (existing) {
        return prev.map(l => l === existing ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, { item, quantity: 1, specialInstructions }];
    });
    setSelectedItem(null);
    setToast(`Added "${item.name}" to cart`);
    setTimeout(() => setToast(""), 2500);
  };

  const totalItems = cart.reduce((s, l) => s + l.quantity, 0);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFFCEF] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Loading menu…</p>
        </div>
      </main>
    );
  }

  const available = items.filter(i => i.is_available);
  const unavailable = items.filter(i => !i.is_available);

  return (
    <main className="min-h-screen bg-[#FFFCEF]">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-800 text-white text-sm px-4 py-2.5 rounded-full shadow-lg animate-fade-in">
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-orange-100 sticky top-0 z-30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <BackLink href="/">Marketplace</BackLink>
          {totalItems > 0 && (
            <span className="bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full">
              {totalItems} in cart
            </span>
          )}
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Store Info */}
        {merchant && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">{merchant.name}</h1>
            {merchant.description && (
              <p className="text-sm text-slate-500 mt-1">{merchant.description}</p>
            )}
            {merchant.location && (
              <p className="text-xs text-orange-700 font-medium mt-1">📍 {merchant.location}</p>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
            {error}
          </div>
        )}

        {items.length === 0 && !error && (
          <div className="bg-white rounded-2xl border border-orange-100 p-8 text-center text-slate-400 text-sm">
            This store hasn't added any menu items yet.
          </div>
        )}

        {/* Available Items */}
        {available.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Menu</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {available.map(item => (
                <FoodCard
                  key={item.id}
                  item={item}
                  merchant={merchant}
                  imageFailed={imageFailed}
                  onImageFail={id => setImageFailed(p => ({ ...p, [id]: true }))}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Sold Out Items */}
        {unavailable.length > 0 && (
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Sold Out</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 opacity-60">
              {unavailable.map(item => (
                <FoodCard
                  key={item.id}
                  item={item}
                  merchant={merchant}
                  imageFailed={imageFailed}
                  onImageFail={id => setImageFailed(p => ({ ...p, [id]: true }))}
                  onClick={() => setSelectedItem(item)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Food Details Dialog */}
      {selectedItem && (
        <FoodDetailsDialog
          item={selectedItem}
          merchant={merchant ? { name: merchant.name, location: merchant.location } : undefined}
          onClose={() => setSelectedItem(null)}
          onAdd={(specialInstructions) => addToCart(selectedItem, specialInstructions)}
        />
      )}
    </main>
  );
}

function FoodCard({
  item,
  merchant,
  imageFailed,
  onImageFail,
  onClick,
}: {
  item: MenuItem;
  merchant: Merchant | null;
  imageFailed: Record<string, boolean>;
  onImageFail: (id: string) => void;
  onClick: () => void;
}) {
  const imgSrc = item.image_url?.startsWith("/")
    ? BACKEND_URL + item.image_url
    : item.image_url;

  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white rounded-2xl border border-orange-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-orange-300 transition-all active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-orange-600 w-full"
    >
      {/* Image */}
      <div className="h-32 w-full bg-orange-50 relative overflow-hidden">
        {imgSrc && !imageFailed[item.id] ? (
          <img
            src={imgSrc}
            alt={item.name}
            loading="lazy"
            onError={() => onImageFail(item.id)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-2xl">🍱</div>
        )}
        {!item.is_available && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-xs font-bold bg-black/60 px-2 py-1 rounded-full">Sold Out</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="font-semibold text-sm text-slate-900 leading-tight line-clamp-2">{item.name}</p>
        {item.description && (
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-snug">{item.description}</p>
        )}
        <p className="mt-2 font-bold text-orange-600 text-sm">RM {Number(item.price).toFixed(2)}</p>
      </div>
    </button>
  );
}
