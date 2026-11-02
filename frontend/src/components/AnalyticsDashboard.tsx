"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DailyStatistics, { type DailyStats } from "./DailyStatistics";
import CustomerSpendingDashboard from "./CustomerSpendingDashboard";

type Analytics = {
  period_days: number;
  statistics?: DailyStats;
  summary: {
    total_revenue: number;
    total_orders: number;
    completed_orders: number;
    confirmed_orders: number;
    active_orders: number;
    customers: number;
  };
  revenue_trend: { date: string; orders: number; revenue: number }[];
  top_items: { id: string; name: string; quantity: number; revenue: number; order_count: number; order_share: number }[];
};

const API_URL = `${BACKEND_URL}`;
const money = (amount: number) => `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AnalyticsDashboard({ audience, embedded = false }: { audience: "admin" | "merchant" | "customer"; embedded?: boolean }) {
  if (audience === "customer") return <CustomerSpendingDashboard />;
  return <SalesDashboard audience={audience} embedded={embedded} />;
}

function SalesDashboard({ audience, embedded = false }: { audience: string; embedded?: boolean }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = audience === "admin";
  const isCustomer = audience === "customer";
  const loginPath = isAdmin ? "/admin/login" : isCustomer ? "/login" : "/vendor/login";

  useEffect(() => {
    let cancelled = false, inFlight = false;
    async function load() {
      if (inFlight) return;
      const token = window.localStorage.getItem("token");
      const expectedRole = isAdmin ? "admin" : isCustomer ? "customer" : "merchant";
      if (!token || window.localStorage.getItem("userRole") !== expectedRole) {
        router.replace(loginPath);
        return;
      }
      inFlight = true;
      setError(null);
      try {
        const endpoint = isAdmin ? "/admin/analytics" : isCustomer ? "/users/me/analytics" : "/merchants/me/analytics";
        const response = await fetch(`${API_URL}${endpoint}?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          window.localStorage.removeItem("token");
          window.localStorage.removeItem("userRole");
          router.replace(loginPath);
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || "Could not load analytics.");
        }
        const result: Analytics = await response.json();
        if (!cancelled) { setData(result); setUpdatedAt(new Date().toLocaleTimeString("en-MY", {timeZone:"Asia/Kuala_Lumpur"})); }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load analytics.");
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [days, isAdmin, isCustomer, loginPath, router, refreshKey]);

  const maxRevenue = Math.max(1, ...(data?.revenue_trend.map((point) => point.revenue) ?? [0]));
  const maxOrders = Math.max(1, ...(data?.revenue_trend.map((point) => point.orders) ?? [0]));
  const revenuePoints = useMemo(() => (data?.revenue_trend ?? []).map((point, index, all) => {
    const x = all.length <= 1 ? 350 : (index / (all.length - 1)) * 700;
    const y = 210 - (point.revenue / maxRevenue) * 185;
    return `${x},${y}`;
  }).join(" "), [data, maxRevenue]);
  const orderPoints = useMemo(() => (data?.revenue_trend ?? []).map((point, index, all) => {
    const x = all.length <= 1 ? 350 : (index / (all.length - 1)) * 700;
    const y = 210 - (point.orders / maxOrders) * 185;
    return `${x},${y}`;
  }).join(" "), [data, maxOrders]);

  const Container = embedded ? "section" : "main";
  return (
    <Container className={embedded ? "" : "min-h-screen bg-stone-50 p-5 sm:p-8"}>
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              {!embedded && !isAdmin && <Link href={isCustomer ? "/profile" : "/vendor/dashboard"} className="inline-block rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
                Back to {isCustomer ? "my account" : "vendor dashboard"}
              </Link>}
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-orange-700">Analytics</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{isAdmin ? "Platform analytics" : isCustomer ? "Your spending" : "Store analytics"}</h2>
              <p className="mt-2 text-sm text-slate-500">{isCustomer ? "Your completed purchases and order activity from the selected period." : "Sales and order activity from the selected period."}</p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Date range
              <select value={days} onChange={(event) => { setData(null); setLoading(true); setDays(Number(event.target.value)); }} className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500"><p>{updatedAt ? `Updated ${updatedAt} MYT · refreshes every 15 seconds` : "Loading latest totals"}</p><button onClick={() => setRefreshKey(k => k + 1)} className="rounded-xl border bg-white px-4 py-2 font-semibold text-orange-700">Refresh</button></div>
        {loading && <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500">Loading analytics…</div>}
        {data && <>
          <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {(isCustomer ? [
              { label: "Total spent", value: money(data.summary.total_revenue), detail: `${data.summary.completed_orders} completed orders` },
              { label: "Orders placed", value: data.summary.total_orders.toLocaleString(), detail: `In the last ${days} days` },
              { label: "Active orders", value: data.summary.active_orders.toLocaleString(), detail: "Currently in progress" },
              { label: "Average completed order", value: money(data.summary.completed_orders ? data.summary.total_revenue / data.summary.completed_orders : 0), detail: "Completed orders only" },
            ] : [
              { label: "Confirmed sales", value: money(data.summary.total_revenue), detail: `${data.summary.confirmed_orders} confirmed · ${data.summary.completed_orders} completed` },
              { label: "All orders", value: data.summary.total_orders.toLocaleString(), detail: `${data.summary.active_orders} active now` },
              { label: "Customers", value: data.summary.customers.toLocaleString(), detail: `In the last ${days} days` },
              { label: "Average confirmed order", value: money(data.summary.confirmed_orders ? data.summary.total_revenue / data.summary.confirmed_orders : 0), detail: "Preparing, ready and completed" },
            ]).map((metric, index) => <article key={metric.label} className={`rounded-2xl border p-5 shadow-sm ${["border-orange-200 bg-orange-50", "border-sky-200 bg-sky-50", "border-violet-200 bg-violet-50", "border-rose-200 bg-rose-50"][index]}`}>
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <p className="mt-3 text-xl sm:text-2xl font-bold text-slate-900">{metric.value}</p>
              <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
            </article>)}
          </section>

          <DailyStatistics stats={data.statistics} merchant={!isAdmin} />
          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-bold text-slate-900">Daily confirmed revenue</h2><p className="mt-1 text-xs text-slate-500">Vendor-confirmed orders · MYR · by order date</p></div>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">{days} days</span>
              </div>
              <div className="mt-5 overflow-hidden">
                <svg viewBox="0 0 700 245" role="img" aria-label={isCustomer ? "Line chart of daily customer spending" : "Line chart of daily completed sales revenue"} className="h-48 w-full sm:h-64">
                  {[25, 85, 145, 210].map((y) => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />)}
                  {revenuePoints && <polyline points={revenuePoints} fill="none" stroke="#ea580c" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
                </svg>
                <div className="flex justify-between text-[11px] text-slate-400"><span>{data.revenue_trend[0]?.date}</span><span>{data.revenue_trend.at(-1)?.date}</span></div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div><h2 className="font-bold text-slate-900">{isCustomer ? "Your order frequency" : "Order frequency"}</h2><p className="mt-1 text-xs text-slate-500">Orders placed each day</p></div>
              <div className="mt-5 overflow-hidden">
                <svg viewBox="0 0 700 245" role="img" aria-label="Line chart of daily order counts" className="h-48 w-full sm:h-64">
                  {[25, 85, 145, 210].map((y) => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />)}
                  {orderPoints && <polyline points={orderPoints} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
                </svg>
                <div className="flex justify-between text-[11px] text-slate-400"><span>{data.revenue_trend[0]?.date}</span><span>{data.revenue_trend.at(-1)?.date}</span></div>
              </div>
            </article>
          </section>

          <details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer list-none font-semibold text-orange-700">View daily sales and order counts</summary><div className="mt-4 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Date (MYT)</th><th>Orders</th><th>Completed sales</th></tr></thead><tbody>{data.revenue_trend.map(d => <tr key={d.date} className="border-t"><td className="py-2">{d.date}</td><td>{d.orders}</td><td>{money(d.revenue)}</td></tr>)}</tbody></table></div></details>
          <p className="text-xs text-stone-500">Sales include preparing, ready and completed orders, grouped by order date. Pending payments and cancelled orders are excluded. Refunds, ingredient costs and bank settlement are not recorded here, so these totals are not net profit.</p>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5"><h2 className="font-bold text-slate-900">Top three dishes</h2><p className="mt-1 text-xs text-slate-500">Ranked by units in vendor-confirmed orders. Compare quantities and revenue when planning stock.</p></div>
            {data.top_items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No confirmed item sales in this period yet.</p> : <div className="space-y-4">
              {data.top_items.map((item, index) => <div key={item.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-orange-800">{index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.quantity} units · {item.order_count} confirmed orders · {item.order_share}% of confirmed orders</p><p className="mt-1 text-xs text-slate-500">Observed purchase frequency, not a future probability. An order can contain multiple dishes.</p></div>
                <p className="text-sm font-semibold text-slate-800">{money(item.revenue)}</p>
              </div>)}
            </div>}
          </section>
        </>}
      </div>
    </Container>
  );
}
