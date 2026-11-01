// src/components/MerchantPickupSlots.tsx
// Dedicated Pickup Slots tab for the vendor dashboard.
// - Vendors & admins always see all slots, including FULL ones (with a red badge).
// - The customer-facing API already filters out full slots — nothing extra needed here.

"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";

interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

export default function MerchantPickupSlots({ merchantId }: { merchantId: string }) {
  const [slots, setSlots] = useState<PickupSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSlot, setNewSlot] = useState({ time_slot: "", max_capacity: "10" });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BACKEND_URL}/merchants/${merchantId}/pickup-slots`);
        if (res.ok) setSlots(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
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
      const created = await res.json();
      setSlots(prev => [...prev, created]);
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
      setSlots(prev => prev.filter(s => s.id !== slotId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fullSlots = slots.filter(s => s.current_bookings >= s.max_capacity);
  const availableSlots = slots.filter(s => s.current_bookings < s.max_capacity);

  return (
    <div className="space-y-6">
      {/* Create new slot */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 space-y-5">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Capacity & Timing</span>
          <h2 className="text-lg font-black text-slate-900">Create Pickup Slot</h2>
          <p className="text-xs text-slate-500">Set time intervals and order limits to manage stall congestion.</p>
        </div>
        <form onSubmit={handleCreate} className="space-y-4 max-w-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Time Slot Date & Time</label>
            <input type="datetime-local" required value={newSlot.time_slot}
              onChange={e => setNewSlot({ ...newSlot, time_slot: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 text-xs text-slate-900 outline-none bg-white" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Max Capacity (Orders)</label>
            <input type="number" required value={newSlot.max_capacity}
              onChange={e => setNewSlot({ ...newSlot, max_capacity: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-orange-500 text-xs text-slate-900 outline-none"
              placeholder="10" />
          </div>
          <button type="submit"
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 rounded-xl transition text-xs shadow cursor-pointer">
            + Generate Pickup Slot
          </button>
        </form>
      </div>

      {/* Active / available slots */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-orange-100 space-y-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Active Slots ({slots.length})</h2>
          <p className="text-xs text-slate-500">Full slots are hidden from customers but shown here so you can track them.</p>
        </div>

        {loading && <p className="text-xs text-slate-400">Loading slots…</p>}

        {!loading && slots.length === 0 && (
          <p className="text-xs text-slate-400">No pickup slots generated yet.</p>
        )}

        {availableSlots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Available ({availableSlots.length})</p>
            {availableSlots.map(slot => (
              <SlotRow key={slot.id} slot={slot} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {fullSlots.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-red-600">Full — Hidden From Customers ({fullSlots.length})</p>
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
          {new Date(slot.time_slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
        </p>
        <p className={`text-[11px] mt-0.5 ${isFull ? "text-red-600 font-semibold" : "text-slate-500"}`}>
          {slot.current_bookings} / {slot.max_capacity} orders
          {isFull && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">FULL · Not Shown To Customers</span>}
        </p>
      </div>
      <button onClick={() => onDelete(slot.id)} className="text-red-600 hover:underline font-semibold px-2 py-1">Delete</button>
    </div>
  );
}
