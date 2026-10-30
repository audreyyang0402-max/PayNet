"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";

type Spending = {
  updated_at: string;
  summary: { total_spent: number; today_spent: number; pending_amount: number; total_orders: number; active_orders: number; completed_orders: number; average_completed_order: number; daily_average: number; ordering_streak: number };
  daily: { date: string; spent: number; orders: number }[];
  top_items: { id: string; name: string; quantity: number; spent: number }[];
};
const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const button = "rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-stone-50 disabled:opacity-50";
export default function CustomerSpendingDashboard() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Spending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [budget, setBudget] = useState("");
  const [budgetKey, setBudgetKey] = useState("");
  const [budgetError, setBudgetError] = useState("");
  useEffect(() => {
    const id = localStorage.getItem("user_id");
    if (id) { const key = `daily-budget:${id}`; setBudgetKey(key); setBudget(localStorage.getItem(key) || ""); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load() {
      if (inFlight) return;
      inFlight = true; setBusy(true);
      try {
        const token = localStorage.getItem("token");
        if (!token) { router.replace("/login"); return; }
        const response = await fetch(`${BACKEND_URL}/users/me/analytics?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok) throw new Error(response.status === 403 ? "This spending tracker is available to customer accounts." : "Could not refresh spending. Any figures shown are from the last successful update.");
        const result = await response.json();
        if (!controller.signal.aborted) { setData(result); setError(""); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load spending."); }
      finally { inFlight = false; if (!controller.signal.aborted) setBusy(false); }
    }
    load();
    const onVisible = () => { if (!document.hidden) load(); };
    const timer = setInterval(onVisible,15000);
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("focus",onVisible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange",onVisible); window.removeEventListener("focus",onVisible); };
  }, [days,refresh,router]);
  const limit = Number(budget) > 0 && Number.isFinite(Number(budget)) ? Number(budget) : 0;
  const max = Math.max(1,...(data?.daily.map(d => d.spent) || []));
  return <main className="min-h-screen bg-[#faf8f3] px-4 py-6 text-stone-900 sm:py-10"><div className="mx-auto max-w-5xl space-y-5">
    <nav className="flex flex-wrap gap-2"><Link href="/profile" className={button}>Back to my account</Link><Link href="/orders" className={button}>Order history</Link></nav>
    <header className="flex flex-wrap items-end justify-between gap-4 py-2">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Your food budget</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Spending tracker</h1><p className="mt-2 max-w-lg text-sm text-stone-500">Know where your money goes, one meal at a time.</p></div>
      <div className="flex gap-2"><label className="sr-only" htmlFor="spending-period">Date range</label><select id="spending-period" className={button} value={days} onChange={e => { setData(null); setDays(Number(e.target.value)); }}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button className={button} disabled={busy} onClick={() => setRefresh(r => r+1)}>{busy ? "Updating…" : "Refresh"}</button></div>
    </header>
    <p className="text-xs text-stone-500" role="status">{data ? `Updated ${new Date(data.updated_at).toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT · refreshes every 15 seconds while visible` : "Loading your spending…"}</p>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {data && <>
      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl bg-[#263e35] p-6 text-white"><p className="text-sm text-white/75">Total spent · last {days} days</p><p className="mt-2 text-4xl font-semibold tracking-tight">{money(data.summary.total_spent)}</p><p className="mt-4 text-xs leading-relaxed text-white/70">Vendor-confirmed orders: preparing, ready and completed. Grouped by the date you placed the order.</p><p className="mt-3 border-t border-white/20 pt-3 text-sm">{money(data.summary.pending_amount)} awaiting payment verification</p></article>
        <article className="rounded-2xl border border-stone-200 bg-white p-6"><div className="flex items-baseline justify-between gap-2"><h2 className="font-semibold">Today’s spending</h2><span className="text-xl font-bold">{money(data.summary.today_spent)}</span></div>
          <label className="mt-4 block text-xs text-stone-500" htmlFor="daily-budget">Optional daily budget (RM) · saved on this browser</label><input id="daily-budget" type="number" min="0.01" step="0.01" placeholder="e.g. 25.00" value={budget} onChange={e => { setBudget(e.target.value); try { if (budgetKey) localStorage.setItem(budgetKey,e.target.value); setBudgetError(""); } catch { setBudgetError("Budget could not be saved on this browser."); } }} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2" />
          {budgetError && <p role="alert" className="mt-2 text-xs text-red-600">{budgetError}</p>}
          {limit > 0 && <><progress aria-label="Today’s budget used" value={Math.min(data.summary.today_spent,limit)} max={limit} className="mt-4 h-2 w-full accent-orange-600" /><p className="mt-2 text-sm">{money(Math.abs(limit-data.summary.today_spent))} {data.summary.today_spent > limit ? "over today’s budget" : "remaining today"}</p></>}
        </article>
      </section>
      <section aria-label="Order and spending totals" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          ["Orders placed",data.summary.total_orders,`Last ${days} days, including cancelled`],
          ["Active orders",data.summary.active_orders,"Pending, preparing or ready · all dates"],
          ["Ordering streak",`${data.summary.ordering_streak} days`,"Consecutive days with confirmed orders, ending today or yesterday"],
          ["Completed orders",data.summary.completed_orders,`Last ${days} days`],
          ["Average completed order",money(data.summary.average_completed_order),"Completed orders only"],
          ["Average daily spend",money(data.summary.daily_average),"Includes days with no spending"],
        ].map(([label,value,note], index) => <article key={String(label)} className={`rounded-xl border p-4 ${["bg-sky-50 border-sky-200", "bg-amber-50 border-amber-200", "bg-violet-50 border-violet-200", "bg-emerald-50 border-emerald-200", "bg-rose-50 border-rose-200", "bg-indigo-50 border-indigo-200"][index]}`}><h2 className="text-xs text-stone-500">{label}</h2><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-2 text-[11px] leading-relaxed text-stone-500">{note}</p></article>)}
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"><div className="flex justify-between"><h2 className="font-semibold">Daily spending</h2><span className="text-xs text-stone-500">Malaysian time · MYR</span></div>
        {data.summary.total_spent === 0 && <p className="mt-4 text-sm text-stone-500">No confirmed spending in this period yet.</p>}
        <div className="mt-5 overflow-x-auto pb-2"><div className="flex h-44 items-end gap-1 border-b border-stone-200" style={{ minWidth: days * 14 }}>{data.daily.map(day => <div key={day.date} className="group flex h-full min-w-2 flex-1 items-end"><div tabIndex={0} aria-label={`${day.date}: ${money(day.spent)}, ${day.orders} orders placed`} title={`${day.date}: ${money(day.spent)} · ${day.orders} orders`} className="w-full rounded-t bg-orange-500 focus:bg-orange-700 hover:bg-orange-700" style={{ height: `${day.spent ? Math.max(2,day.spent/max*100) : 1}%` }} /></div>)}</div><div className="mt-2 flex justify-between text-[11px] text-stone-500"><span>{data.daily[0]?.date}</span><span>Highest day: {money(Math.max(...data.daily.map(d => d.spent)))}</span><span>{data.daily.at(-1)?.date}</span></div></div>
        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-orange-700">View daily amounts and order frequency</summary><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Daily spending and orders placed</caption><thead><tr className="border-b"><th className="py-2">Date</th><th>Orders</th><th className="text-right">Spent</th></tr></thead><tbody>{[...data.daily].reverse().map(d => <tr key={d.date} className="border-b border-stone-100"><td className="py-2">{d.date}</td><td>{d.orders}</td><td className="text-right">{money(d.spent)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6"><h2 className="font-semibold">Your most ordered food</h2><p className="mt-1 text-xs text-stone-500">Ranked by quantity in vendor-confirmed orders during this period.</p>{!data.top_items.length ? <p className="py-6 text-sm text-stone-500">Your favourites will appear after an order is confirmed.</p> : <ol className="mt-4 divide-y divide-stone-100">{data.top_items.map((item,i) => <li key={item.id} className="flex items-center gap-3 py-3"><span className="text-xs text-stone-400">{String(i+1).padStart(2,"0")}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.name}</p><p className="text-xs text-stone-500">{item.quantity} ordered{i === 0 ? " · Your most frequent choice" : ""}</p></div><span className="text-sm font-medium">{money(item.spent)}</span></li>)}</ol>}</section>
      <p className="text-xs leading-relaxed text-stone-500">This tracks order values confirmed by vendors, not bank transactions. Pending and cancelled orders are excluded from spending. Refunds or payments outside Payvolution are not reflected.</p>
    </>}
  </div></main>;
}
