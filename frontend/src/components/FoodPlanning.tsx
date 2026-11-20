"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type Forecast = {
  date: string; menu_item_id: string; menu_item_name: string;
  sample_days: number; expected: number | null; low: number | null; high: number | null;
  already_booked: number; confidence: "insufficient_data" | "limited" | "baseline";
  availability_verified: boolean;
  excluded_censored_days: number;
  validation: { evaluated_days: number; mae: number | null; last_day_mae: number | null };
};
type FoodLog = {
  menu_item_id: string; menu_item_name: string; service_date: string;
  prepared_portions: number; unsold_portions: number; discarded_portions: number; sold_out: boolean;
};
type Planning = {
  method: string; updated_at: string; history_offered_days: number; upcoming_slot_days: string[];
  menu_items: { id: string; name: string }[]; forecasts: Forecast[]; logs: FoodLog[];
  measured: { logged_days: number; prepared_portions: number; unsold_portions: number;
    discarded_portions: number; sold_out_dish_days: number };
};

const todayMYT = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export default function FoodPlanning() {
  const [data, setData] = useState<Planning | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [itemId, setItemId] = useState("");
  const [serviceDate, setServiceDate] = useState(todayMYT);
  const [prepared, setPrepared] = useState(0);
  const [unsold, setUnsold] = useState(0);
  const [discarded, setDiscarded] = useState(0);
  const [soldOut, setSoldOut] = useState(false);

  async function load() {
    const token = localStorage.getItem("token");
    if (!token) { setError("Please sign in again."); setLoading(false); return; }
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/food-planning`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error(`Could not load food planning (${response.status}).`);
      const next: Planning = await response.json();
      setData(next);
      setItemId(previous => previous || next.menu_items[0]?.id || "");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load food planning.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => window.clearInterval(timer);
  }, []);

  function selectExisting(menuItemId: string, date: string) {
    setItemId(menuItemId); setServiceDate(date);
    const existing = data?.logs.find(row => row.menu_item_id === menuItemId && row.service_date === date);
    setPrepared(existing?.prepared_portions || 0);
    setUnsold(existing?.unsold_portions || 0);
    setDiscarded(existing?.discarded_portions || 0);
    setSoldOut(existing?.sold_out || false);
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!itemId) return;
    if (unsold + discarded > prepared) {
      setError("Unsold and discarded portions cannot exceed prepared portions."); return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/food-planning/${itemId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ service_date: serviceDate, prepared_portions: prepared,
          unsold_portions: unsold, discarded_portions: discarded, sold_out: soldOut }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save this record.");
      setMessage("Daily food record saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this record.");
    } finally { setSaving(false); }
  }

  return <section className="space-y-5" aria-label="Food planning">
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-5">
      <h2 className="mt-1 text-2xl font-bold text-slate-900">Prepare with real data</h2>
      <p className="mt-2 text-sm text-slate-600">Record what you prepared and what remained. Demand estimates use your confirmed orders on days you offered pickup slots.</p>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    {loading && <p className="text-sm text-slate-500">Loading planning data…</p>}
    {data && <>
      <p className="text-xs font-medium text-slate-500">Measured entries from the last 30 days</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {([
          ["Days logged", data.measured.logged_days], ["Portions prepared", data.measured.prepared_portions],
          ["Unsold", data.measured.unsold_portions], ["Discarded", data.measured.discarded_portions],
          ["Discarded share", data.measured.prepared_portions ? `${Math.round(100 * data.measured.discarded_portions / data.measured.prepared_portions)}%` : "—"],
          ["Sold-out dish days", data.measured.sold_out_dish_days],
        ] as const).map(([label, value], index) => <div key={label} className={`rounded-2xl border p-4 ${["border-sky-200 bg-sky-50", "border-violet-200 bg-violet-50", "border-amber-200 bg-amber-50", "border-rose-200 bg-rose-50", "border-teal-200 bg-teal-50", "border-indigo-200 bg-indigo-50"][index]}`}>
          <p className="text-xs font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>)}
      </div>
      <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Daily food record</h3>
        <p className="mt-1 text-xs text-slate-500">Unsold means still available at closing. Discarded means thrown away. Keep these counts separate.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">Dish<select required value={itemId} onChange={e => selectExisting(e.target.value, serviceDate)} className="mt-1 w-full rounded-xl border p-2.5"><option value="">Choose a dish</option>{data.menu_items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium text-slate-700">Date<input required type="date" max={todayMYT()} value={serviceDate} onChange={e => selectExisting(itemId, e.target.value)} className="mt-1 w-full rounded-xl border p-2.5" /></label>
          {([["Prepared", prepared, setPrepared], ["Unsold", unsold, setUnsold], ["Discarded", discarded, setDiscarded]] as const).map(([label, value, setter]) => <label key={label} className="text-sm font-medium text-slate-700">{label} portions<input required type="number" min="0" max="10000" value={value} onChange={e => setter(Number(e.target.value))} className="mt-1 w-full rounded-xl border p-2.5" /></label>)}
          <label className="flex items-center gap-2 self-end rounded-xl border p-2.5 text-sm font-medium text-slate-700"><input type="checkbox" checked={soldOut} onChange={e => setSoldOut(e.target.checked)} />Sold out today</label>
        </div>
        <button disabled={saving || !itemId} className="mt-4 rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save daily record"}</button>
      </form>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">Upcoming pickup day estimates</h3>
        <p className="mt-1 text-xs text-slate-500">{data.method} Based on {data.history_offered_days} past offered days. Confirmed portions form the minimum.</p>
        {data.upcoming_slot_days.length === 0 ? <p className="mt-4 text-sm text-slate-500">Create future pickup slots to see planning estimates.</p> :
          <div className="mt-4 max-h-96 space-y-2 overflow-auto">{data.forecasts.map(row => <div key={`${row.date}-${row.menu_item_id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-sm">
            <div><strong className="text-slate-900">{row.menu_item_name}</strong><span className="ml-2 text-slate-500">{row.date}</span><p className="text-xs text-slate-500">{row.already_booked} confirmed · {row.sample_days} comparable days{row.excluded_censored_days > 0 ? ` · ${row.excluded_censored_days} sold-out days excluded` : ""}{!row.availability_verified ? " · past dish availability unverified" : ""}</p>
              {row.validation.evaluated_days > 0 && <p className="text-xs text-slate-500">Past forecast error: {row.validation.mae} portions (last comparable day: {row.validation.last_day_mae}; {row.validation.evaluated_days} test days)</p>}</div>
            <span className="font-semibold text-orange-800">{row.expected === null ? "Not enough history" : `${row.low}–${row.high} portions${row.confidence === "limited" ? " · limited data" : ""}`}</span>
          </div>)}</div>}
        <p className="mt-3 text-xs text-slate-500">These are decision aids, not automatic stock limits. A limited or missing history needs merchant judgment.</p>
      </div>
      {data.logs.length > 0 && <details className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-semibold text-slate-900">Recent food records</summary><div className="mt-3 space-y-2">{data.logs.map(row => <button key={`${row.service_date}-${row.menu_item_id}`} type="button" onClick={() => selectExisting(row.menu_item_id, row.service_date)} className="block w-full rounded-lg border p-2 text-left text-sm hover:bg-orange-50">{row.service_date} · {row.menu_item_name} · {row.prepared_portions} prepared · {row.unsold_portions} unsold · {row.discarded_portions} discarded{row.sold_out ? " · sold out" : ""}</button>)}</div></details>}
    </>}
  </section>;
}
