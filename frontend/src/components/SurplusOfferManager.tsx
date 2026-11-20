"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type MenuItem = { id: string; name: string; price: number; is_available: boolean };
type PickupSlot = { id: string; time_slot: string; current_bookings: number; max_capacity: number };
type Offer = { id: string; menu_item_name: string; regular_price: number; sale_price: number;
  remaining_portions: number; pickup_time: string | null; expires_at: string;
  is_active: boolean; available: boolean };
type Impact = { offers_created: number; listed_portions: number; confirmed_portions: number;
  completed_portions: number; pending_portions: number; rejected_portions: number;
  confirmed_order_value: number; past_offer_dish_days: number; logged_offer_dish_days: number;
  discarded_portions_on_logged_offer_days: number };
const mytDate = (date: Date) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(date);
const mytTime = (value: string) => new Date(value).toLocaleString("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short",
});
const deadlineHasPassed = (deadline: Date) => deadline.getTime() <= Date.now();

export default function SurplusOfferManager({ merchantId }: { merchantId: string }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [itemId, setItemId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [price, setPrice] = useState("");
  const [portions, setPortions] = useState("");
  const [minutesBefore, setMinutesBefore] = useState(15);
  const [confirmedSafe, setConfirmedSafe] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
    try {
      const [itemsResponse, slotsResponse, offersResponse, impactResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/merchants/${merchantId}/items`, { headers, cache: "no-store" }),
        fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`, { headers, cache: "no-store" }),
        fetch(`${BACKEND_URL}/merchants/me/surplus-offers`, { headers, cache: "no-store" }),
        fetch(`${BACKEND_URL}/merchants/me/surplus-impact`, { headers, cache: "no-store" }),
      ]);
      if (!itemsResponse.ok || !slotsResponse.ok || !offersResponse.ok) throw new Error("Could not load menu, slots, or offers.");
      const menu: MenuItem[] = await itemsResponse.json();
      setItems(menu.filter(item => item.is_available && Number(item.price) > 0));
      setSlots(await slotsResponse.json());
      setOffers(await offersResponse.json());
      setImpact(impactResponse.ok ? await impactResponse.json() : null);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load offers."); }
  }, [merchantId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);

  const today = mytDate(new Date(now));
  const todaySlots = slots.filter(slot => mytDate(new Date(slot.time_slot)) === today &&
    new Date(slot.time_slot).getTime() > now && slot.current_bookings < slot.max_capacity);
  const selectedSlot = todaySlots.find(slot => slot.id === slotId);
  const selectedItem = items.find(item => item.id === itemId);
  const deadline = selectedSlot ? new Date(new Date(selectedSlot.time_slot).getTime() - minutesBefore * 60000) : null;

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !selectedItem || !deadline || deadlineHasPassed(deadline)) {
      setError("Choose a pickup slot with enough time before the order deadline."); return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/surplus-offers`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ menu_item_id: itemId, pickup_slot_id: slotId,
          sale_price: price, total_portions: Number(portions), expires_at: deadline.toISOString(),
          confirm_safe_to_sell: confirmedSafe }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not publish offer.");
      setMessage("Surplus offer published. Existing menu prices are unchanged.");
      setPrice(""); setPortions(""); setConfirmedSafe(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not publish offer."); }
    finally { setSaving(false); }
  }

  async function end(offerId: string) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/surplus-offers/${offerId}/end`, {
        method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Could not end offer.");
      setMessage("Offer ended. Orders already placed keep their agreed price.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not end offer."); }
    finally { setSaving(false); }
  }

  return <section className="space-y-5" aria-label="Surplus meals">
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-amber-50 p-5">
      <h2 className="text-2xl font-bold text-slate-900">Surplus Meals</h2>
      <p className="mt-2 text-sm text-slate-600">Offer suitable remaining portions for a specific pickup slot today. You choose the discount, quantity and order deadline.</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
    {impact && <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-slate-900">Last 30 days of offer outcomes</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["Offers created", impact.offers_created], ["Listed portions", impact.listed_portions],
          ["Confirmed orders", impact.confirmed_portions], ["Completed pickups", impact.completed_portions],
          ["Pending portions", impact.pending_portions], ["Rejected portions", impact.rejected_portions],
          ["Confirmed order value", `RM ${impact.confirmed_order_value.toFixed(2)}`],
          ["Logged discards on offer days", impact.discarded_portions_on_logged_offer_days]] as const).map(([label, value]) =>
          <div key={label} className="rounded-xl border border-violet-100 bg-violet-50 p-3"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>)}
      </div>
      <p className="mt-3 text-xs text-slate-600">Food records cover {impact.logged_offer_dish_days} of {impact.past_offer_dish_days} past dish days with offers. Listed portions can include the same food when an offer is ended and relisted. Discards are merchant-reported; sales do not by themselves prove waste was prevented.</p>
    </div>}
    <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-slate-900">Create an offer</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Dish<select required value={itemId} onChange={event => setItemId(event.target.value)} className="mt-1 w-full rounded-xl border p-2.5"><option value="">Choose a dish</option>{items.map(item => <option key={item.id} value={item.id}>{item.name} · RM {Number(item.price).toFixed(2)}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Pickup slot today<select required value={slotId} onChange={event => setSlotId(event.target.value)} className="mt-1 w-full rounded-xl border p-2.5"><option value="">Choose a slot</option>{todaySlots.map(slot => <option key={slot.id} value={slot.id}>{mytTime(slot.time_slot)} · {slot.max_capacity - slot.current_bookings} places left</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Surplus price (RM)<input required type="number" min="0.01" max={selectedItem ? Math.max(0.01, Number(selectedItem.price) - 0.01) : undefined} step="0.01" value={price} onChange={event => setPrice(event.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
        <label className="text-sm font-medium text-slate-700">Portions to offer<input required type="number" min="1" max="1000" step="1" value={portions} onChange={event => setPortions(event.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
        <label className="text-sm font-medium text-slate-700">Stop taking orders<select value={minutesBefore} onChange={event => setMinutesBefore(Number(event.target.value))} className="mt-1 w-full rounded-xl border p-2.5">{[5, 15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes before pickup</option>)}</select></label>
        <div className="self-end text-sm text-slate-600">{deadline ? `Order deadline: ${mytTime(deadline.toISOString())}` : "Choose a slot to see the order deadline."}</div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-slate-700"><input required type="checkbox" checked={confirmedSafe} onChange={event => setConfirmedSafe(event.target.checked)} className="mt-1" />I confirm these portions are suitable to sell and will be stored and handed over according to my stall&apos;s food handling rules.</label>
      <p className="mt-3 text-xs text-slate-500">Offers require a future pickup slot today. Any daily portion limit still applies. Orders already placed are not changed if you end an offer.</p>
      <button disabled={saving || todaySlots.length === 0} className="mt-4 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Publish offer"}</button>
    </form>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Recent offers</h3><button type="button" onClick={() => void load()} className="text-sm font-semibold text-violet-700">Refresh</button></div>
      {offers.length === 0 ? <p className="mt-4 text-sm text-slate-500">No offers yet.</p> : <div className="mt-4 space-y-3">{offers.map(offer => <article key={offer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
        <div><p className="font-semibold text-slate-900">{offer.menu_item_name}</p><p className="text-xs text-slate-600">RM {offer.sale_price.toFixed(2)} (regular RM {offer.regular_price.toFixed(2)}) · {offer.remaining_portions} left</p><p className="text-xs text-slate-500">{offer.pickup_time ? mytTime(offer.pickup_time) : "Slot removed"} · deadline {mytTime(offer.expires_at)}</p></div>
        {offer.is_active ? <button type="button" disabled={saving} onClick={() => void end(offer.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">{offer.available ? "End offer" : "Close offer"}</button> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">Ended</span>}
      </article>)}</div>}
    </div>
  </section>;
}
