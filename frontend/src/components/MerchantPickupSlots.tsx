// src/components/MerchantPickupSlots.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import CopyPickupWeek from "./CopyPickupWeek";
import WeeklyPickupSchedule from "./WeeklyPickupSchedule";
import PickupSlotsTour from "./PickupSlotsTour";

interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
  is_automatic?: boolean;
  is_bookable?: boolean;
}

export default function MerchantPickupSlots({
  merchantId,
}: {
  merchantId: string;
}) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlot, setNewSlot] = useState({ time_slot: "", max_capacity: "10" });

  const refreshSlots = async () => {
    const res = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store" });
    if (!res.ok) throw new Error("Could not load pickup slots.");
    const data: PickupSlot[] = await res.json();
    setSlots(data.filter(sl => new Date(sl.time_slot).getTime() > Date.now()));
  };

  useEffect(() => {
    let active = true;
    fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store" })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Could not load pickup slots.")))
      .then((data: PickupSlot[]) => {
        if (!active) return;
        const upcomingSlots = data.filter(sl => new Date(sl.time_slot).getTime() > Date.now());
        setSlots(upcomingSlots);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Reload when the merchant changes; action handlers refresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
      const formattedTimeSlot = newSlot.time_slot.includes("+") || newSlot.time_slot.endsWith("Z")
        ? newSlot.time_slot
        : `${newSlot.time_slot}:00+08:00`;
      const res = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ time_slot: formattedTimeSlot, max_capacity: parseInt(newSlot.max_capacity, 10) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create pickup slot.");
      }
      await refreshSlots();
      setNewSlot({ time_slot: "", max_capacity: "10" });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not create pickup slot.");
    }
  };

  const handleDelete = async (slotId: string) => {
    if (!confirm("Delete this pickup slot?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/merchants/pickup-slots/${slotId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.detail || "Failed to delete pickup slot.");
      }
      const updated = slots.filter(s => s.id !== slotId);
      setSlots(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete pickup slot.");
    }
  };

  const upcoming = slots;
  const fullSlots = upcoming.filter(s => s.current_bookings >= s.max_capacity || s.is_bookable === false);
  const availableSlots = upcoming.filter(s => s.current_bookings < s.max_capacity && s.is_bookable !== false);
  const bookableSlots = upcoming.filter(s => s.is_bookable !== false);
  const totalBookings = bookableSlots.reduce((s, sl) => s + sl.current_bookings, 0);
  const totalCapacity = bookableSlots.reduce((s, sl) => s + sl.max_capacity, 0);
  const byDay: Record<string, PickupSlot[]> = {};
  for (const slot of upcoming) {
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(slot.time_slot));
    (byDay[day] ||= []).push(slot);
  }

  return (
    <div className="space-y-4">
      <WeeklyPickupSchedule onSaved={() => { void refreshSlots(); }} />
      <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-slate-900">Upcoming pickup times</h2>
          <PickupSlotsTour />
        </div>
        <p className="mt-1 text-sm text-slate-600">{loading ? "Loading times…" : `${availableSlots.length} open · ${fullSlots.length} full or closed · ${totalBookings}/${totalCapacity} places booked`}</p>
        {!loading && upcoming.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-teal-100 px-2.5 py-1 font-bold text-teal-800">{upcoming.filter(s => s.is_automatic).length} auto (from your weekly hours)</span>
            <span className="rounded-full bg-indigo-100 px-2.5 py-1 font-bold text-indigo-800">{upcoming.filter(s => !s.is_automatic).length} added manually</span>
            <span className="text-slate-400">Seeing both for the same time? Delete whichever one you don't need below.</span>
          </p>
        )}
        {!loading && upcoming.length === 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">No pickup times yet. Set your weekly schedule above once to start taking bookings.</p>}
        <div className="mt-4 space-y-2">
          {Object.keys(byDay).sort().map(day => {
            const daySlots = byDay[day];
            const open = daySlots.filter(slot => slot.is_bookable !== false && slot.current_bookings < slot.max_capacity).length;
            return <details key={day} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">{new Date(`${day}T12:00:00+08:00`).toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "long", day: "numeric", month: "short" })} · {open} open times</summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">{daySlots.map(slot => <SlotRow key={slot.id} slot={slot} onDelete={handleDelete} isFull={slot.is_bookable === false || slot.current_bookings >= slot.max_capacity} />)}</div>
            </details>;
          })}
        </div>
      </section>
      <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-bold text-slate-800">Need a one-off pickup time? Open manual tools</summary>
        <p className="mt-2 text-sm text-slate-600">Use these only for a special event or a change outside your normal weekly hours.</p>
        <div className="mt-4 space-y-4">
          <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-700">Pickup date and time<input type="datetime-local" required value={newSlot.time_slot} onChange={e => setNewSlot({ ...newSlot, time_slot: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" /></label>
            <label className="text-xs font-semibold text-slate-700">Order capacity<input type="number" required min={1} max={500} value={newSlot.max_capacity} onChange={e => setNewSlot({ ...newSlot, max_capacity: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" /></label>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Add one-off time</button>
          </form>
          <CopyPickupWeek key={merchantId} merchantId={merchantId} onUpdated={updated => { setSlots(updated.filter(sl => new Date(sl.time_slot).getTime() > Date.now())); }} />
        </div>
      </details>
    </div>
  );
}

function SlotRow({ slot, onDelete, isFull = false }: { slot: PickupSlot; onDelete: (id: string) => void; isFull?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border flex justify-between items-center text-xs ${isFull ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
      <div>
        <p className="font-bold text-slate-900">
          {new Date(slot.time_slot).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${isFull ? "text-red-600 font-semibold" : "text-slate-500"}`}>
          <span>{slot.current_bookings} / {slot.max_capacity} orders</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${slot.is_automatic ? "bg-teal-100 text-teal-700" : "bg-indigo-100 text-indigo-700"}`}>
            {slot.is_automatic ? "Weekly" : "Manual"}
          </span>
          {isFull && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{slot.is_bookable === false ? "CLOSED" : "FULL"}</span>}
        </p>
      </div>
      {!slot.is_automatic && <button onClick={() => onDelete(slot.id)} className="text-red-600 hover:underline font-semibold px-2 py-1">Delete</button>}
    </div>
  );
}
