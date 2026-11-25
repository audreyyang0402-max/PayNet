"use client";

import { useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type Slot = { id: string; time_slot: string; max_capacity: number; current_bookings: number; is_automatic?: boolean; is_bookable?: boolean };
type Draft = { time: string; capacity: number; included: boolean };

function malaysiaDate(value: string | number) {
  return new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 16);
}
function addDays(day: string, count: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
}

export default function CopyPickupWeek({ merchantId, onUpdated }: { merchantId: string; onUpdated: (slots: Slot[]) => void }) {
  const [source, setSource] = useState(() => addDays(malaysiaDate(Date.now()).slice(0, 10), -7));
  const [target, setTarget] = useState(() => malaysiaDate(Date.now()).slice(0, 10));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [existing, setExisting] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [referenceNow, setReferenceNow] = useState(() => Date.now());
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });
  async function loadSlots(fromDate?: string): Promise<Slot[]> {
    const query = fromDate ? `?from_date=${encodeURIComponent(fromDate)}` : "";
    const response = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots${query}`, { headers: headers(), cache: "no-store" });
    if (!response.ok) throw new Error("Could not load pickup slots. Please try again.");
    return response.json();
  }
  async function preview() {
    setBusy(true); setMessage(""); setDrafts([]);
    setReferenceNow(Date.now());
    try {
      const slots = await loadSlots(source);
      const end = addDays(source, 7);
      const offset = (Date.parse(`${target}T00:00:00Z`) - Date.parse(`${source}T00:00:00Z`)) / 86400000;
      const rows = slots.filter(slot => {
        const day = malaysiaDate(slot.time_slot).slice(0, 10);
        return !slot.is_automatic && day >= source && day < end;
      }).map(slot => {
        const local = malaysiaDate(slot.time_slot);
        return { time: `${addDays(local.slice(0, 10), offset)}T${local.slice(11)}`, capacity: slot.max_capacity, included: true };
      });
      setExisting(slots.map(slot => Date.parse(slot.time_slot)));
      setDrafts(rows);
      if (!rows.length) setMessage("No manual slots in this source week. Automatic times are already created from your weekly schedule.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not preview slots."); }
    finally { setBusy(false); }
  }
  function skipReason(row: Draft, index: number) {
    const time = Date.parse(`${row.time}:00+08:00`);
    if (!Number.isFinite(time) || time <= referenceNow) return "Past or invalid time — skipped";
    if (existing.includes(time) || drafts.slice(0, index).some(other => other.included && other.time === row.time)) return "Duplicate time — skipped";
    return "";
  }
  const selected = drafts.filter((row, index) => row.included && !skipReason(row, index));
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !selected.length) return;
    if (!window.confirm(`Create ${selected.length} pickup slots for ${target} to ${addDays(target, 6)} (Malaysia time)?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots/batch`, {
        method: "POST", headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ slots: selected.map(row => ({ time_slot: `${row.time}:00+08:00`, max_capacity: row.capacity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not create slots. Check the times and capacities.");
      setDrafts([]);
      setMessage(`Created ${result.created} slots. Skipped ${result.skipped} duplicates found when saving. New slots have zero bookings.`);
      try { onUpdated(await loadSlots()); }
      catch { setMessage(`Created ${result.created} slots. Reload the page to see the updated list.`); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save slots. You can retry safely."); }
    finally { setBusy(false); }
  }
  const inputClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900";
  return <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 md:col-span-2 space-y-3">
    <h2 className="font-bold text-slate-900">Copy manual pickup slots</h2>
    <p className="text-sm text-slate-600">For one-off plans, copy seven days of manual slots. Regular times come from your weekly schedule. All times are Malaysia time (UTC+8).</p>
    <form onSubmit={event => { event.preventDefault(); void preview(); }}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Copy from — start date<input type="date" required className={inputClass} value={source} onChange={event => { setSource(event.target.value); setDrafts([]); setMessage(""); }} />{source && <span className="mt-1 block text-xs font-normal">Source range: {source} to {addDays(source, 6)}</span>}</label>
        <label className="text-sm font-semibold">Copy to — start date<input type="date" required className={inputClass} value={target} onChange={event => { setTarget(event.target.value); setDrafts([]); setMessage(""); }} />{target && <span className="mt-1 block text-xs font-normal">Target range: {target} to {addDays(target, 6)}</span>}</label>
        <button className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50" type="submit">{busy ? "Working…" : "Preview copied slots"}</button>
      </fieldset>
    </form>
    {message && <p role="status" className="text-sm text-slate-800">{message}</p>}
    {drafts.length > 0 && <form onSubmit={create}>
      <fieldset disabled={busy} className="space-y-3">
        <p className="text-sm">Untick slots for closed days. {selected.length} slots ready to create; {drafts.filter((row, index) => row.included && skipReason(row, index)).length} will be skipped.</p>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {drafts.map((row, index) => <div key={index} className="rounded-xl bg-white p-3 grid gap-2 sm:grid-cols-[auto_1fr_8rem]">
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={row.included} onChange={event => setDrafts(rows => rows.map((r, i) => i === index ? { ...r, included: event.target.checked } : r))} />Include</label>
            <label className="text-xs">Pickup date and time<input type="datetime-local" required={row.included} disabled={!row.included} min={`${target}T00:00`} max={`${addDays(target, 6)}T23:59`} value={row.time} className={inputClass} onChange={event => setDrafts(rows => rows.map((r, i) => i === index ? { ...r, time: event.target.value } : r))} /></label>
            <label className="text-xs">Capacity<input type="number" required={row.included} disabled={!row.included} min={1} max={500} value={row.capacity} className={inputClass} onChange={event => setDrafts(rows => rows.map((r, i) => i === index ? { ...r, capacity: Number(event.target.value) } : r))} /></label>
            {row.included && skipReason(row, index) && <p className="text-xs text-amber-800 sm:col-span-3">{skipReason(row, index)}</p>}
          </div>)}
        </div>
        <button type="submit" disabled={!selected.length || busy} className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create {selected.length} pickup slots</button>
      </fieldset>
    </form>}
  </section>;
}
