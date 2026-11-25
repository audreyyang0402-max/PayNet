"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type Hours = { weekday: number; opens: string; closes: string };
type Schedule = {
  enabled: boolean;
  paused: boolean;
  interval_minutes: number;
  max_capacity: number;
  lead_minutes: number;
  days: Hours[];
  closed_dates: string[];
};
type Demand = { period_days: number; confirmed_orders: number; enough_history: boolean; busiest_hours: { weekday: number; hour: number; orders: number; observed_days: number }[] };

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function WeeklyPickupSchedule({ onSaved }: { onSaved: () => void }) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [closedDate, setClosedDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [demand, setDemand] = useState<Demand | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${BACKEND_URL}/merchants/me/pickup-schedule`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store",
    }).then(async response => {
      if (!response.ok) throw new Error("Could not load your weekly schedule.");
      return response.json();
    }).then(data => { if (active) { setSchedule(data.days.length === 0 ? { ...data, enabled: true } : data); setEditing(!data.enabled && data.days.length === 0); } })
      .catch(error => { if (active) setMessage(error.message); });
    fetch(`${BACKEND_URL}/merchants/me/pickup-demand`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store",
    }).then(response => response.ok ? response.json() : null)
      .then(data => { if (active) setDemand(data); }).catch(() => {});
    return () => { active = false; };
  }, []);

  function updateDay(weekday: number, patch: Partial<Hours> | null) {
    setSchedule(current => {
      if (!current) return current;
      const previous = current.days.find(day => day.weekday === weekday);
      const days = current.days.filter(day => day.weekday !== weekday);
      if (patch) days.push({ weekday, opens: "11:00", closes: "14:00", ...previous, ...patch });
      return { ...current, days: days.sort((a, b) => a.weekday - b.weekday) };
    });
  }

  async function saveSchedule(next: Schedule) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/pickup-schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(next),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(result.detail) ? result.detail.map((issue: { msg: string }) => issue.msg).join("; ") : result.detail;
        throw new Error(detail || "Could not save your schedule.");
      }
      setSchedule(result);
      setEditing(false);
      setMessage(result.paused ? "New pickup bookings paused. Existing orders are unchanged." : "Pickup settings saved. Open times repeat automatically each week.");
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your schedule."); }
    finally { setBusy(false); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (schedule) await saveSchedule(schedule);
  }

  function useWeekdayPreset() {
    setSchedule(current => current ? { ...current, enabled: true, days: [0, 1, 2, 3, 4].map(weekday => {
      const existing = current.days.find(day => day.weekday === weekday);
      return existing || { weekday, opens: "11:00", closes: "14:00" };
    }) } : current);
  }

  const fieldClass = "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900";
  return <section className="rounded-2xl border border-orange-200 bg-white p-5 md:col-span-2 space-y-4">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Set once, adjust anytime</p>
      <h2 className="text-lg font-black text-slate-900">Weekly pickup schedule</h2>
      <p className="text-sm text-slate-600">Set your usual hours once. Customers can book the next seven days automatically.</p>
    </div>
    {schedule && !editing && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-slate-800">
      <p className="font-bold">{schedule.paused ? "New bookings paused" : schedule.enabled ? "Automatic pickup times are on" : "Automatic pickup times are off"}</p>
      <p className="mt-1">{schedule.days.map(day => `${weekdays[day.weekday].slice(0, 3)} ${day.opens.slice(0, 5)}–${day.closes.slice(0, 5)}`).join(" · ") || "No regular days selected"}</p>
      <p className="mt-1 text-xs text-slate-600">Every {schedule.interval_minutes} minutes · up to {schedule.max_capacity} orders per time · {schedule.closed_dates.length} closed dates</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing(true)} className="rounded-lg bg-orange-700 px-3 py-2 text-xs font-bold text-white">Edit weekly hours</button>
        <button type="button" disabled={busy} onClick={() => void saveSchedule({ ...schedule, paused: !schedule.paused })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 disabled:opacity-50">{schedule.paused ? "Resume new bookings" : "Pause new bookings"}</button>
      </div>
    </div>}
    {demand && <details className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
      <summary className="cursor-pointer font-bold">Pickup demand · last {demand.period_days} days</summary>
      {demand.enough_history ? <p className="mt-1">Busiest observed hours: {demand.busiest_hours.map(item => `${weekdays[item.weekday]} ${String(item.hour).padStart(2, "0")}:00 (${item.orders} orders across ${item.observed_days} days)`).join(" · ")}. Use this as a guide when setting hours and capacity.</p>
        : <p className="mt-1">{demand.confirmed_orders} confirmed orders so far. Busiest hours appear after 10 confirmed orders.</p>}
    </details>}
    {!schedule ? <p className="text-sm text-slate-500">Loading schedule…</p> : editing && <form onSubmit={save} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={schedule.enabled} onChange={event => setSchedule({ ...schedule, enabled: event.target.checked })} />
        Automatically offer pickup times
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <input type="checkbox" checked={schedule.paused} onChange={event => setSchedule({ ...schedule, paused: event.target.checked })} />
        Pause all new pickup bookings
      </label>
      <button type="button" onClick={useWeekdayPreset} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900">Select Monday to Friday</button>
      <div className="space-y-2">
        {weekdays.map((name, weekday) => {
          const hours = schedule.days.find(day => day.weekday === weekday);
          return <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[12rem_1fr_1fr]">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" checked={Boolean(hours)} onChange={event => updateDay(weekday, event.target.checked ? {} : null)} />{name}</label>
            {hours ? <><input aria-label={`${name} opening time`} type="time" required value={hours.opens} onChange={event => updateDay(weekday, { opens: event.target.value })} className={fieldClass} />
              <input aria-label={`${name} closing time`} type="time" required value={hours.closes} onChange={event => updateDay(weekday, { closes: event.target.value })} className={fieldClass} /></>
              : <span className="col-span-2 text-sm text-slate-500">Closed</span>}
          </div>;
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Minutes between pickups
          <select className={fieldClass} value={schedule.interval_minutes} onChange={event => setSchedule({ ...schedule, interval_minutes: Number(event.target.value) })}>
            {[10, 15, 20, 30, 60].map(value => <option key={value} value={value}>{value} minutes</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Orders per pickup time
          <input className={fieldClass} type="number" min={1} max={100} required value={schedule.max_capacity} onChange={event => setSchedule({ ...schedule, max_capacity: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-700">Order ahead by at least
          <select className={fieldClass} value={schedule.lead_minutes} onChange={event => setSchedule({ ...schedule, lead_minutes: Number(event.target.value) })}>
            {[0, 10, 20, 30, 45, 60, 90, 120, 180].map(value => <option key={value} value={value}>{value} minutes</option>)}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
        <p className="text-sm font-bold text-amber-950">Closed dates</p>
        <div className="flex flex-wrap gap-2"><input aria-label="Date to close" type="date" value={closedDate} onChange={event => setClosedDate(event.target.value)} className={fieldClass} />
          <button type="button" disabled={!closedDate || schedule.closed_dates.includes(closedDate)} onClick={() => { setSchedule({ ...schedule, closed_dates: [...schedule.closed_dates, closedDate].sort() }); setClosedDate(""); }} className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Add closed date</button></div>
        <div className="flex flex-wrap gap-2">{schedule.closed_dates.map(day => <button key={day} type="button" onClick={() => setSchedule({ ...schedule, closed_dates: schedule.closed_dates.filter(value => value !== day) })} className="rounded-full bg-white px-3 py-1 text-xs text-amber-950 border border-amber-300">{day} ×</button>)}</div>
      </div>
      <div className="flex gap-2"><button type="submit" disabled={busy} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save weekly schedule"}</button>
        {schedule.days.length > 0 && <button type="button" onClick={() => setEditing(false)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>}</div>
    </form>}
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}
