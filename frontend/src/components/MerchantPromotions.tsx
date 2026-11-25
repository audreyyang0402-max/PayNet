"use client";

import { useEffect, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";

type Totals = { orders: number; units: number; revenue: number; units_per_day: number | null; revenue_per_day: number | null; discount?: number };
type Campaign = { id: string; name: string; item_name: string; discount_type: string; discount_value: number; starts_at: string; ends_at: string; observed_until: string; status: string; baseline_start: string; baseline_end: string; observed_days: number; promotion: Totals; normal: Totals; excluded_refund_case_value: number; units_change_pct: number | null; revenue_change_pct: number | null };
const money = (n: number) => `RM ${Number(n).toFixed(2)}`;
const date = (s: string) => new Date(s).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mytInput = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 16);
const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal";
const delta = (n: number | null) => n === null ? "Not enough baseline data" : `${n > 0 ? "+" : ""}${n}%`;

export default function MerchantPromotions({ items, manage = false, refreshKey = 0 }: {
  items?: { id: string; name: string; price: number }[]; manage?: boolean; refreshKey?: number;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [name, setName] = useState("");
  const [itemId, setItemId] = useState("");
  const [type, setType] = useState("percentage");
  const [value, setValue] = useState("");
  const [start, setStart] = useState(() => mytInput(new Date()));
  const [end, setEnd] = useState(() => mytInput(new Date(Date.now() + 7 * 86400000)));
  const [updated, setUpdated] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("Sign in as a merchant to view promotions.");
        const response = await fetch(`${BACKEND_URL}/merchants/me/promotions`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not load promotion performance. Try Refresh.");
        const data = await response.json();
        if (!controller.signal.aborted) { setCampaigns(data); setError(""); setUpdated(date(new Date().toISOString())); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load promotions."); }
      finally { inFlight = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [reload, refreshKey]);

  async function mutate(path: string, body?: object) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`${BACKEND_URL}/merchants/me/promotions${path}`, { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Please check the discount and dates. Offers must end within 90 days of starting.");
      setNotice(path ? "Promotion stopped. Past sales remain in the report." : "Promotion saved. Eligible customers will receive the discount at checkout.");
      setReload((r) => r + 1);
      if (!path) { setName(""); setValue(""); }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save promotion."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-5 rounded-2xl border border-orange-200 bg-white p-5 shadow-sm sm:p-6" aria-label={manage ? "Manage deals and discounts" : "Promotion performance"}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-700">Deals & Discounts</p><h2 className="mt-1 text-xl font-bold text-slate-900">{manage ? "Create a merchant promotion" : "Promotion performance"}</h2><p className="mt-2 text-sm text-slate-500">{manage ? "Schedule an offer for a dish. Normal menu prices stay separate." : "Compare discounted sales with earlier normal-price sales for the same dish."}</p></div><button type="button" onClick={() => setReload((r) => r + 1)} className="rounded-xl border px-4 py-2 text-sm font-semibold text-orange-700">Refresh</button></header>
    {manage && <form onSubmit={(e) => { e.preventDefault(); void mutate("", { menu_item_id: itemId, name, discount_type: type, discount_value: value, starts_at: `${start}:00+08:00`, ends_at: `${end}:00+08:00` }); }} className="grid gap-4 rounded-2xl bg-orange-50/60 p-4 sm:grid-cols-2">
      <label className="text-xs font-bold text-slate-700">Promotion name<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lunch special" className={field} /></label>
      <label className="text-xs font-bold text-slate-700">Dish<select required value={itemId} onChange={(e) => setItemId(e.target.value)} className={field}><option value="">Select a dish</option>{items?.map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price)}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-700">Discount type<select value={type} onChange={(e) => setType(e.target.value)} className={field}><option value="percentage">Percentage off (%)</option><option value="fixed">Amount off (RM)</option></select></label>
      <label className="text-xs font-bold text-slate-700">{type === "percentage" ? "Percentage" : "Discount amount (RM)"}<input required type="number" min="0.01" max={type === "percentage" ? "99.99" : undefined} step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={field} /></label>
      <label className="text-xs font-bold text-slate-700">Starts (Malaysia time)<input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={field} /></label>
      <label className="text-xs font-bold text-slate-700">Ends (Malaysia time)<input required type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={field} /></label>
      <p className="text-xs leading-relaxed text-slate-500 sm:col-span-2">One offer per dish at a time, for up to 90 days. Offers cannot be backdated. To change a saved offer, stop it and create another; its sales history is retained.</p>
      <button disabled={busy || !items?.length} type="submit" className="rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2">{busy ? "Saving…" : "Schedule promotion"}</button>
    </form>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading && <p className="text-sm text-slate-500">Loading promotions…</p>}
    {!loading && !campaigns.length && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No promotions yet. Create one under Menu → Deals & Discounts.</p>}
    {!manage && campaigns.length > 0 && <p className="rounded-xl bg-indigo-50 p-4 text-xs leading-relaxed text-indigo-900">These reports cover each campaign’s observed lifetime, independently of the sales dashboard’s date filter. They compare equal-length calendar windows shifted by whole weeks to match weekday and time. Open hours, stock availability and other promotions are not controlled. Results show historical differences, not proof of extra sales or profit. Orders with any tracked refund case are excluded from both periods.</p>}
    {updated && <p className="text-xs text-slate-400">Updated {updated} MYT · refreshes every 30 seconds while visible</p>}
    <div className="space-y-4">{campaigns.map((c) => <article key={c.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-slate-900">{c.name}</h3><p className="mt-1 text-sm text-slate-600">{c.item_name} · {c.discount_type === "percentage" ? `${c.discount_value}%` : money(c.discount_value)} off</p><p className="mt-2 text-xs text-slate-500">{date(c.starts_at)} – {date(c.ends_at)} MYT</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{c.status}</span></div>
      {manage ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{c.promotion.units} confirmed units · {money(c.promotion.revenue)} sales</span>{["active", "scheduled"].includes(c.status) && <button disabled={busy} type="button" onClick={() => { if (window.confirm(`Stop “${c.name}”? Customers will return to the normal price.`)) void mutate(`/${c.id}/stop`); }} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Stop promotion</button>}</div> : <>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[["Discounted units", c.promotion.units], ["Confirmed sales", money(c.promotion.revenue)], ["Discount given", money(c.promotion.discount || 0)], ["Orders containing offer", c.promotion.orders]].map(([label, amount]) => <div key={label} className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-lg font-bold">{amount}</p></div>)}</div>
        {c.observed_days > 0 ? <>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[370px] text-left text-sm"><caption className="mb-2 text-left text-xs text-slate-500">{c.observed_days < 0.01 ? "<0.01" : c.observed_days.toFixed(2)} elapsed calendar days · current period through {date(c.observed_until)} MYT</caption><thead><tr className="border-b"><th className="py-2">Measure</th><th>Normal-price window</th><th>Promotion window</th></tr></thead><tbody>{[["Units sold", c.normal.units, c.promotion.units], ["Units/day", c.normal.units_per_day, c.promotion.units_per_day], ["Sales/day", money(c.normal.revenue_per_day || 0), money(c.promotion.revenue_per_day || 0)], ["Confirmed orders", c.normal.orders, c.promotion.orders]].map(([label, before, during]) => <tr key={label} className="border-b border-slate-100"><th className="py-2 font-medium">{label}</th><td>{before}</td><td>{during}</td></tr>)}</tbody></table></div>
          <p className="mt-3 text-xs text-slate-500">Comparison: {date(c.baseline_start)} – {date(c.baseline_end)} MYT. Only normal-price sales are included in that window.</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm"><span className="rounded-lg bg-slate-50 p-2">Units change: <strong>{delta(c.units_change_pct)}</strong></span><span className="rounded-lg bg-slate-50 p-2">Sales change: <strong>{delta(c.revenue_change_pct)}</strong></span></div>
          {(c.observed_days < 1 || c.promotion.orders < 5 || c.normal.orders < 5) && <p className="mt-3 text-xs text-amber-800">Limited observation time or few orders: treat this comparison cautiously.</p>}
        </> : <p className="mt-4 text-sm text-slate-500">Performance will appear after the promotion starts.</p>}
        <p className="mt-3 text-xs text-slate-500">Promotion item value excluded due to refund cases: {money(c.excluded_refund_case_value)}. Sales are after discounts and before costs; they are not profit.</p>
      </>}
    </article>)}</div>
  </section>;
}
