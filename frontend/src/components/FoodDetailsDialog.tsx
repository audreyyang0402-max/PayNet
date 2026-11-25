"use client";

import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
import OfferPrice from "@/components/OfferPrice";
import { type Offer } from "@/lib/promotions";
import { getMenuCustomizationPolicy, parseMenuDescription } from "@/lib/menu-customizations";

type Food = {
  original_price?: number;
  promotion?: Offer | null;
  name: string;
  description: string | null;
  price: number;
  image_url?: string | null;
  is_available: boolean;
};

const SUGAR_LEVELS = ["Normal sugar", "Less sugar", "No sugar"];
const ICE_LEVELS = ["Normal ice", "Less ice", "No ice"];

interface FoodDetailsDialogProps {
  item: Food;
  merchant?: { name: string; location: string };
  onClose: () => void;
  onAdd: (specialInstructions: string) => void;
}

export default function FoodDetailsDialog({ item, merchant, onClose, onAdd }: FoodDetailsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [sugar, setSugar] = useState("Normal sugar");
  const [ice, setIce] = useState("Normal ice");
  const [note, setNote] = useState("");
  const [spice, setSpice] = useState(() => getMenuCustomizationPolicy(item.name, item.description).defaultSpice);

  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = previous;
    };
  }, []);

  const image = item.image_url?.startsWith("/") ? BACKEND_URL + item.image_url : item.image_url;
  const parsedDescription = parseMenuDescription(item.description);
  const policy = getMenuCustomizationPolicy(item.name, item.description);
  const metadataChips = parsedDescription.tags.filter((tag) => !/^(customizations|spice choices|default spice)\s*:/i.test(tag));
  const selectedSpice = policy.spiceLevels.includes(spice) ? spice : policy.defaultSpice;
  const hasChoiceControls = policy.allowsSugar || policy.allowsIce || policy.allowsSpice;
  const hasCustomizations = hasChoiceControls || policy.allowsSpecialRequests;

  const handleAdd = () => {
    const choices: string[] = [];
    if (policy.allowsSugar) choices.push(`Sugar: ${sugar}`);
    if (policy.allowsIce) choices.push(`Ice: ${ice}`);
    if (policy.allowsSpice) choices.push(`Spice: ${selectedSpice}`);
    if (policy.allowsSpecialRequests && note.trim()) choices.push(`Note: ${note.trim()}`);
    onAdd(choices.join(" | "));
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="food-details-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-orange-700">{merchant?.name || "Campus stall"}</p>
            <h2 id="food-details-title" className="mt-1 text-xl font-bold">{item.name}</h2>
          </div>
          <button autoFocus type="button" onClick={onClose} aria-label="Close food details" className="h-9 w-9 shrink-0 rounded-full bg-slate-100 text-xl focus-visible:outline-2 focus-visible:outline-orange-600">
            &times;
          </button>
        </div>

        {image && !imageFailed ? (
          <img src={image} alt={item.name} onError={() => setImageFailed(true)} className="mt-4 h-52 w-full rounded-2xl object-cover" />
        ) : (
          <div className="mt-4 flex h-32 items-center justify-center rounded-2xl bg-orange-50 text-sm text-slate-500">Photo unavailable</div>
        )}

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {parsedDescription.description || "The stall has not added a description yet."}
        </p>
        {metadataChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metadataChips.map((chip) => (
              <span key={chip} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">{chip}</span>
            ))}
          </div>
        )}

        {hasChoiceControls && (
          <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
            {policy.allowsSugar && <ChoiceGroup label="Sugar level" options={SUGAR_LEVELS} value={sugar} onChange={setSugar} />}
            {policy.allowsIce && <ChoiceGroup label="Ice level" options={ICE_LEVELS} value={ice} onChange={setIce} />}
            {policy.allowsSpice && <ChoiceGroup label="Spice level" options={policy.spiceLevels} value={selectedSpice} onChange={setSpice} />}
          </div>
        )}

        {policy.allowsSpecialRequests && (
          <label className="mt-5 block text-sm font-semibold text-slate-800">
            Special preparation request <span className="font-normal text-slate-400">(optional)</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, 180))}
              rows={3}
              maxLength={180}
              placeholder={policy.isBeverage ? "e.g. no whipped cream" : "e.g. sauce on the side, no onion"}
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
            <span className="mt-1 block text-right text-[11px] font-normal text-slate-400">{note.length}/180</span>
            <span className="mt-1 block text-xs font-normal leading-relaxed text-amber-700">
              Requests cannot change the item&apos;s temperature, size, or priced add-ons.
            </span>
          </label>
        )}

        <div className="mt-4 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Pickup location</h3>
          <p className="mt-1 text-sm">{merchant?.location || "Location not provided"}</p>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-slate-600">{item.is_available ? "Available" : "Sold out"}</span>
          <div className="text-lg"><OfferPrice item={item} /></div>
        </div>
        <button type="button" disabled={!item.is_available} onClick={handleAdd} className="mt-4 w-full rounded-xl bg-[#F04B14] px-4 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
          {item.is_available ? (hasCustomizations ? "Add customised item to cart" : "Add item to cart") : "Currently unavailable"}
        </button>
      </div>
    </dialog>
  );
}

function ChoiceGroup({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-800">{label}</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`rounded-xl border px-2 py-2 text-xs font-semibold transition ${value === option ? "border-orange-600 bg-orange-50 text-orange-700" : "border-slate-200 text-slate-600 hover:border-orange-300"}`}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
