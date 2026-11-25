"use client";

import { useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type MenuItem = { id: string; name: string; is_available: boolean };
type Stock = { menu_item_id: string; total_portions: number; reserved_portions: number; remaining_portions: number };
const mytDate = (value: Date) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
}).format(value);

export default function DailyStockManager({ merchantId, items }: { merchantId: string; items: MenuItem[] }) {
  const [date, setDate] = useState(() => mytDate(new Date()));
  const [rows, setRows] = useState<Record<string, Stock>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const requestId = useRef(0);

  async function load() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/${merchantId}/stock?service_date=${date}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load daily portion limits.");
      const result: Stock[] = await response.json();
      if (currentRequest !== requestId.current) return;
      setRows(Object.fromEntries(result.map(row => [row.menu_item_id, row])));
      setDrafts(Object.fromEntries(result.map(row => [row.menu_item_id, String(row.total_portions)])));
      setError("");
    } catch (cause) {
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : "Could not load daily portion limits.");
    } finally { if (currentRequest === requestId.current) setLoading(false); }
  }

  useEffect(() => { void load(); return () => { requestId.current += 1; }; }, [merchantId, date]);

  async function save(item: MenuItem) {
    const raw = drafts[item.id]?.trim() ?? "";
    const total = raw === "" ? null : Number(raw);
    if (total !== null && (!Number.isInteger(total) || total < 0 || total > 10000)) {
      setError("Enter a whole number from 0 to 10,000, or leave the field blank for no limit."); return;
    }
    setSaving(item.id); setError(""); setMessage("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/stock/${item.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ service_date: date, total_portions: total }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not save the limit.");
      setMessage(`${item.name}: ${total === null ? "no daily limit" : `${total} portions for ${date}`}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the limit.");
    } finally { setSaving(null); }
  }

  return <details className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4">
    <summary className="cursor-pointer text-sm font-bold text-teal-900">Set daily portion limits</summary>
    <p className="mt-2 text-xs text-slate-600">Optional. Blank means no limit; 0 stops new orders for that dish and day. Existing orders stay reserved. The separate Sold Out switch hides a dish on every date.</p>
    <label className="mt-4 block text-xs font-semibold text-slate-700">Pickup date (Malaysia time)
      <input type="date" min={mytDate(new Date())} max={mytDate(new Date(Date.now() + 30 * 86400000))}
        value={date} onChange={event => { setDate(event.target.value); setMessage(""); }}
        className="mt-1 block rounded-xl border border-slate-300 bg-white p-2.5 text-sm" />
    </label>
    {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-lg bg-white p-2 text-xs text-teal-800">{message}</p>}
    {loading && <p className="mt-3 text-xs text-slate-500">Refreshing portions…</p>}
    <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
      {items.map(item => {
        const stock = rows[item.id];
        return <div key={item.id} className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="min-w-40 flex-1"><p className="text-sm font-semibold text-slate-900">{item.name}</p>
            <p className="text-xs text-slate-500">{!item.is_available ? "Hidden from customers · " : ""}{stock ? `${stock.reserved_portions} reserved or sold · ${stock.remaining_portions} left` : "No daily limit"}</p></div>
          <label className="text-xs font-medium text-slate-700">Total portions
            <input type="number" min="0" max="10000" step="1" placeholder="No limit"
              value={drafts[item.id] ?? ""} onChange={event => setDrafts(current => ({ ...current, [item.id]: event.target.value }))}
              className="mt-1 block w-32 rounded-lg border border-slate-300 p-2 text-sm" />
          </label>
          <button type="button" onClick={() => void save(item)} disabled={saving === item.id || loading}
            className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{saving === item.id ? "Saving…" : "Save"}</button>
        </div>;
      })}
    </div>
  </details>;
}
