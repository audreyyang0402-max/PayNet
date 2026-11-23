"use client";

import { useEffect, useState } from "react";

// Shown automatically the first time a merchant opens the Pickup Slots tab,
// and re-openable any time via a small "How this works" button -- the
// pickup-slot auto/manual split confuses new vendors, so this explains it
// once up front instead of relying on them reading every label.
const STORAGE_KEY = "pickupSlotsTourSeen";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Two ways pickup times appear",
    body:
      "Your pickup times can come from two places: the weekly schedule you set once (opening hours), or one-off times you add by hand for a special day. Both show up together below.",
  },
  {
    title: "\"Weekly\" badge = automatic",
    body:
      "Any time tagged Weekly was generated automatically from your weekly schedule. You don't need to add these yourself -- just set your opening hours once and they keep appearing every week.",
  },
  {
    title: "\"Manual\" badge = you added it",
    body:
      "Times tagged Manual were added by you for a specific date -- useful for a one-off event or an extra slot outside your normal hours. Only manual times can be deleted individually; weekly ones follow your schedule.",
  },
  {
    title: "Seeing two times that clash?",
    body:
      "If a Weekly time and a Manual time end up at the same moment, customers will see both as separate bookable slots -- which is confusing. Just delete whichever Manual one you don't need, or update your weekly hours instead.",
  },
];

export default function PickupSlotsTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      // Private browsing / storage blocked -- just don't auto-show, no crash.
    }
  }, []);

  function close() {
    setOpen(false);
    setStep(0);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setStep(0); setOpen(true); }}
        className="text-xs font-semibold text-orange-700 underline hover:text-orange-800"
      >
        How pickup times work
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={close}>
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-orange-500">
                Quick tour · {step + 1}/{STEPS.length}
              </span>
              <button onClick={close} className="h-7 w-7 rounded-full bg-stone-100 text-stone-500 text-sm font-bold hover:bg-stone-200">✕</button>
            </div>

            <h3 className="text-lg font-black text-slate-900">{STEPS[step].title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{STEPS[step].body}</p>

            <div className="flex gap-1.5 justify-center">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 w-6 rounded-full ${i === step ? "bg-orange-600" : "bg-stone-200"}`} />
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              {step > 0 && (
                <button onClick={() => setStep((s) => s - 1)} className="flex-1 rounded-xl bg-stone-100 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-200">
                  Back
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button onClick={() => setStep((s) => s + 1)} className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white hover:bg-orange-700">
                  Next
                </button>
              ) : (
                <button onClick={close} className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white hover:bg-orange-700">
                  Got it
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
