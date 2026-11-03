// src/app/admin/transactions/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";

interface TxOrder {
  id: string;
  order_number?: string | null;
  status: string;
  total_price: number;
  created_at: string;
  customer_name: string;
  merchant_id: string;
  merchant_name: string;
  transaction_ref?: string | null;
  items: { name: string; quantity: number; price_at_order: number }[];
}

const STATUS_LABELS: Record<string, string> = {
  pending_verification: "Verifying Payment",
  pending: "Verifying Payment",
  preparing: "Preparing",
  ready: "Ready For Pickup",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  pending_verification: "bg-yellow-100 text-yellow-700",
  pending: "bg-yellow-100 text-yellow-700",
  preparing: "bg-blue-100 text-blue-700",
  ready: "bg-emerald-100 text-emerald-700",
  completed: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

const money = (n: number) => `RM ${Number(n).toFixed(2)}`;
const fmt = (ts: string) => new Date(ts).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });

export default function AdminTransactions() {
  const router = useRouter();

  const [orders, setOrders] = useState<TxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (localStorage.getItem("userRole") !== "admin") { router.replace("/login"); return; }
    const token = localStorage.getItem("token");
    fetch(`${BACKEND_URL}/admin/orders`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.detail || "Could not load transactions.");
        return r.json();
      })
      .then((data) => setOrders(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  const merchants = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => map.set(o.merchant_id, o.merchant_name));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (merchantFilter !== "all" && o.merchant_id !== merchantFilter) return false;
      if (q && !(o.order_number?.toLowerCase().includes(q) || o.customer_name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [orders, statusFilter, merchantFilter, search]);

  const totalRevenue = useMemo(
    () => filtered.filter((o) => o.status === "completed").reduce((sum, o) => sum + Number(o.total_price), 0),
    [filtered]
  );

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-stone-400">Site-wide ledger</p>
            <h1 className="mt-0.5 text-xl font-black text-slate-900">Transactions</h1>
          </div>
          <p className="text-xs text-stone-500">
            {filtered.length} of {orders.length} orders{orders.length >= 500 ? " (showing the 500 most recent)" : ""}
            {statusFilter === "all" && <> &middot; <strong className="text-emerald-700">{money(totalRevenue)}</strong> completed in view</>}
          </p>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select value={merchantFilter} onChange={(e) => setMerchantFilter(e.target.value)}
            className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-700 max-w-[12rem]">
            <option value="all">All vendors</option>
            {merchants.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # or customer…"
            className="flex-1 min-w-[10rem] rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-orange-400" />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-400">No transactions match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-[10px] font-black uppercase tracking-widest text-stone-400">
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filtered.map((o) => (
                    <tr key={o.id} className="hover:bg-stone-50/70 transition">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{o.order_number || `#${o.id.slice(0, 8).toUpperCase()}`}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-800">{o.customer_name}</td>
                      <td className="px-4 py-3 text-xs text-stone-600">{o.merchant_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_STYLES[o.status] ?? "bg-stone-100 text-stone-600"}`}>
                          {STATUS_LABELS[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-900">{money(o.total_price)}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">{fmt(o.created_at)}</td>
                      <td className="px-4 py-3">
                        {o.transaction_ref ? (
                          <a href={o.transaction_ref} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={o.transaction_ref} alt="Receipt" loading="lazy"
                              className="h-10 w-10 rounded-lg border border-stone-200 object-cover hover:opacity-80 transition" />
                          </a>
                        ) : (
                          <span className="text-[11px] text-stone-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
