// src/components/MerchantPickupSlots.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";

interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

export default function MerchantPickupSlots({
  merchantId,
  onSlotsChange,
}: {
  merchantId: string;
  onSlotsChange?: (totalBookings: number, totalCapacity: number) => void;
}) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlot, setNewSlot] = useState({ time_slot: "", max_capacity: "10" });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`);
        if (res.ok) {
          const data = await res.json();
          setSlots(data);
          if (onSlotsChange) {
            const totalBookings = data.reduce((s: number, sl: PickupSlot) => s + sl.current_bookings, 0);
            const totalCapacity = data.reduce((s: number, sl: PickupSlot) => s + sl.max_capacity, 0);
            onSlotsChange(totalBookings, totalCapacity);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [merchantId]);

  const notifyParent = (updated: PickupSlot[]) => {
    if (onSlotsChange) {
      const totalBookings = updated.reduce((s, sl) => s + sl.current_bookings, 0);
      const totalCapacity = updated.reduce((s, sl) => s + sl.max_capacity, 0);
      onSlotsChange(totalBookings, totalCapacity);
    }
  };

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
      const created = await res.json();
      const updated = [...slots, created];
      setSlots(updated);
      notifyParent(updated);
      setNewSlot({ time_slot: "", max_capacity: "10" });
    } catch (err: any) {
      alert(err.message);
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
      if (!res.ok) throw new Error("Failed to delete pickup slot.");
      const updated = slots.filter(s => s.id !== slotId);
      setSlots(updated);
      notifyParent(updated);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fullSlots = slots.filter(s => s.current_bookings >= s.max_capacity);
  const availableSlots = slots.filter(s => s.current_bookings < s.max_capacity);
  const totalBookings = slots.reduce((s, sl) => s + sl.current_bookings, 0);
  const totalCapacity = slots.reduce((s, sl) => s + sl.max_capacity, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      {/* LEFT — Create new slot */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 space-y-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Capacity & Timing</span>
          <h2 className="text-base font-black text-slate-900">Create Pickup Slot</h2>
          <p className="text-xs text-slate-500">Set time intervals and order limits to manage stall congestion.</p>
        </div>
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Time Slot Date & Time</label>
            <input
              type="datetime-local"
              required
              value={newSlot.time_slot}
              onChange={e => setNewSlot({ ...newSlot, time_slot: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 text-xs text-slate-900 outline-none bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Max Capacity (Orders)</label>
            <input
              type="number"
              required
              value={newSlot.max_capacity}
              onChange={e => setNewSlot({ ...newSlot, max_capacity: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 text-xs text-slate-900 outline-none"
              placeholder="10"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl transition text-xs shadow cursor-pointer"
          >
            + Generate Pickup Slot
          </button>
        </form>

        {/* Summary pill */}
        {slots.length > 0 && (
          <div className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-center border ${
            totalBookings >= totalCapacity
              ? "bg-red-50 border-red-200 text-red-700"
              : totalBookings / totalCapacity >= 0.7
              ? "bg-yellow-50 border-yellow-200 text-yellow-700"
              : "bg-emerald-50 border-emerald-200 text-emerald-700"
          }`}>
            {totalBookings >= totalCapacity
              ? `⚠️ All slots full (${totalBookings}/${totalCapacity}) — Add more slots!`
              : `📊 Total bookings: ${totalBookings} / ${totalCapacity}`}
          </div>
        )}
      </div>

      {/* RIGHT — Active slots list */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 space-y-3">
        <div>
          <h2 className="text-base font-black text-slate-900">
            Active Slots ({slots.length})
          </h2>
          <p className="text-xs text-slate-500">Full slots are hidden from customers but shown here so you can track them.</p>
        </div>

        {loading && <p className="text-xs text-slate-400">Loading slots…</p>}

        {!loading && slots.length === 0 && (
          <p className="text-xs text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-xl">
            No pickup slots generated yet.
          </p>
        )}

        {availableSlots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Available ({availableSlots.length})
            </p>
            {availableSlots.map(slot => (
              <SlotRow key={slot.id} slot={slot} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {fullSlots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">
              Full — Hidden From Customers ({fullSlots.length})
            </p>
            {fullSlots.map(slot => (
              <SlotRow key={slot.id} slot={slot} onDelete={handleDelete} isFull />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

function SlotRow({ slot, onDelete, isFull = false }: { slot: PickupSlot; onDelete: (id: string) => void; isFull?: boolean }) {
  return (
    <div className={`p-3 rounded-xl border flex justify-between items-center text-xs ${isFull ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200"}`}>
      <div>
        <p className="font-bold text-slate-900">
          {new Date(slot.time_slot).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className={`text-[11px] mt-0.5 ${isFull ? "text-red-600 font-semibold" : "text-slate-500"}`}>
          {slot.current_bookings} / {slot.max_capacity} orders
          {isFull && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">FULL</span>}
        </p>
      </div>
      <button onClick={() => onDelete(slot.id)} className="text-red-600 hover:underline font-semibold px-2 py-1">Delete</button>
    </div>
  );
}
