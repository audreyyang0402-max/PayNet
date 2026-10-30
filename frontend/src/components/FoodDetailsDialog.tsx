"use client";
import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
type Food = { name: string; description: string | null; price: number; image_url?: string | null; is_available: boolean };
export default function FoodDetailsDialog({ item, merchant, onClose, onAdd }: { item: Food; merchant?: { name: string; location: string }; onClose: () => void; onAdd: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = previous; };
  }, []);
  const image = item.image_url?.startsWith("/") ? BACKEND_URL + item.image_url : item.image_url;
  return <dialog ref={dialog} aria-labelledby="food-details-title" onCancel={onClose} onClose={onClose}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm">
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold text-orange-700">{merchant?.name || "Campus stall"}</p><h2 id="food-details-title" className="mt-1 text-xl font-bold">{item.name}</h2></div>
        <button autoFocus type="button" onClick={onClose} aria-label="Close food details" className="h-9 w-9 shrink-0 rounded-full bg-slate-100 text-xl focus-visible:outline-2 focus-visible:outline-orange-600">×</button>
      </div>
      {image && !imageFailed ? <img src={image} alt={item.name} onError={() => setImageFailed(true)} className="mt-4 h-52 w-full rounded-2xl object-cover" /> : <div className="mt-4 flex h-32 items-center justify-center rounded-2xl bg-orange-50 text-sm text-slate-500">Photo unavailable</div>}
      <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">{item.description?.trim() || "The stall has not added a description yet."}</p>
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-xs font-semibold uppercase text-slate-500">Location</h3><p className="mt-1 text-sm">{merchant?.location || "Location not provided"}</p></div>
      <div className="mt-5 flex items-center justify-between"><span className="text-sm text-slate-600">{item.is_available ? "Available" : "Sold out"}</span><strong className="text-xl text-orange-600">RM {Number(item.price).toFixed(2)}</strong></div>
      <button type="button" disabled={!item.is_available} onClick={onAdd} className="mt-4 w-full rounded-xl bg-[#F04B14] px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{item.is_available ? "Add to Cart" : "Currently unavailable"}</button>
    </div>
  </dialog>;
}
