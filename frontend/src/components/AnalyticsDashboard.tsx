"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Analytics = {
  period_days: number;
  summary: {
    total_revenue: number;
    total_orders: number;
    completed_orders: number;
    active_orders: number;
    customers: number;
  };
  revenue_trend: { date: string; orders: number; revenue: number }[];
  top_items: { id: string; name: string; quantity: number; revenue: number }[];
};

const API_URL = "http://127.0.0.1:8000";
const money = (amount: number) => `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AnalyticsDashboard({ audience }: { audience: "admin" | "merchant" }) {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = audience === "admin";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = window.localStorage.getItem("token");
      const expectedRole = isAdmin ? "admin" : "merchant";
      if (!token || window.localStorage.getItem("userRole") !== expectedRole) {
        router.replace(isAdmin ? "/admin/login" : "/vendor/login");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const endpoint = isAdmin ? "/admin/analytics" : "/merchants/me/analytics";
        const response = await fetch(`${API_URL}${endpoint}?days=${days}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          window.localStorage.removeItem("token");
          window.localStorage.removeItem("userRole");
          router.replace(isAdmin ? "/admin/login" : "/vendor/login");
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || "Could not load analytics.");
        }
        const result: Analytics = await response.json();
        if (!cancelled) setData(result);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load analytics.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [days, isAdmin, router]);

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

  return (
    <main className="min-h-screen bg-slate-50 p-5 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link href={isAdmin ? "/admin/rentals" : "/vendor/dashboard"} className="text-sm font-medium text-orange-700 hover:underline">
                ← Back to {isAdmin ? "admin" : "vendor"} dashboard
              </Link>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-orange-700">Phase 7 · Analytics</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">{isAdmin ? "Platform analytics" : "Store analytics"}</h1>
              <p className="mt-2 text-sm text-slate-500">Sales and order activity from the selected period.</p>
            </div>
            <label className="text-sm font-medium text-slate-700">
              Date range
              <select value={days} onChange={(event) => setDays(Number(event.target.value))} className="ml-3 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </label>
          </div>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading && <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500">Loading analytics…</div>}
        {!loading && data && <>
          <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Completed sales", value: money(data.summary.total_revenue), detail: `${data.summary.completed_orders} completed orders` },
              { label: "All orders", value: data.summary.total_orders.toLocaleString(), detail: `${data.summary.active_orders} active now` },
              { label: "Customers", value: data.summary.customers.toLocaleString(), detail: `In the last ${days} days` },
              { label: "Average order", value: money(data.summary.completed_orders ? data.summary.total_revenue / data.summary.completed_orders : 0), detail: "Completed orders only" },
            ].map((metric) => <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-slate-500">{metric.label}</p>
              <p className="mt-3 text-2xl font-bold text-slate-900">{metric.value}</p>
              <p className="mt-2 text-xs text-slate-500">{metric.detail}</p>
            </article>)}
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-bold text-slate-900">Daily revenue</h2><p className="mt-1 text-xs text-slate-500">Completed orders · MYR</p></div>
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">{days} days</span>
              </div>
              <div className="mt-5 overflow-hidden">
                <svg viewBox="0 0 700 245" role="img" aria-label="Line chart of daily completed sales revenue" className="h-64 w-full">
                  {[25, 85, 145, 210].map((y) => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />)}
                  {revenuePoints && <polyline points={revenuePoints} fill="none" stroke="#ea580c" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
                </svg>
                <div className="flex justify-between text-[11px] text-slate-400"><span>{data.revenue_trend[0]?.date}</span><span>{data.revenue_trend.at(-1)?.date}</span></div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div><h2 className="font-bold text-slate-900">Order frequency</h2><p className="mt-1 text-xs text-slate-500">Orders placed each day</p></div>
              <div className="mt-5 overflow-hidden">
                <svg viewBox="0 0 700 245" role="img" aria-label="Line chart of daily order counts" className="h-64 w-full">
                  {[25, 85, 145, 210].map((y) => <line key={y} x1="0" x2="700" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />)}
                  {orderPoints && <polyline points={orderPoints} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />}
                </svg>
                <div className="flex justify-between text-[11px] text-slate-400"><span>{data.revenue_trend[0]?.date}</span><span>{data.revenue_trend.at(-1)?.date}</span></div>
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5"><h2 className="font-bold text-slate-900">Top-selling items</h2><p className="mt-1 text-xs text-slate-500">Ranked by quantities in completed orders</p></div>
            {data.top_items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No completed item sales in this period yet.</p> : <div className="space-y-4">
              {data.top_items.map((item, index) => <div key={item.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 text-xs font-bold text-orange-800">{index + 1}</span>
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.name}</p><p className="text-xs text-slate-500">{item.quantity} sold</p></div>
                <p className="text-sm font-semibold text-slate-800">{money(item.revenue)}</p>
              </div>)}
            </div>}
          </section>
        </>}
      </div>
    </main>
  );
}
