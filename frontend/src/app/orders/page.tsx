// src/app/orders/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BackLink from "@/components/BackLink";

interface Order {
  id: string;
  merchant_id?: string;
  merchant_name?: string | null;
  status: string;
  total_price: number;
  created_at: string;
  pickup_time?: string | null;
  pickup_service_date?: string | null; // "YYYY-MM-DD", set once at checkout, never moves
}

const TZ = "Asia/Kuala_Lumpur";

// YYYY-MM-DD for "today" in Malaysia time, regardless of the visitor's own clock.
function todayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

// The date customers actually care about for "is this for today" -- the
// service date set once at checkout, never moved by a later slot change.
// Falls back to the date half of pickup_time for any older order that
// predates that column.
function orderDateKey(order: Order): string | null {
  if (order.pickup_service_date) return order.pickup_service_date;
  if (order.pickup_time) return new Date(order.pickup_time).toLocaleDateString("en-CA", { timeZone: TZ });
  return null;
}

function formatPickupDate(order: Order): string | null {
  const key = orderDateKey(order);
  if (!key) return null;
  const today = todayKey();
  if (key === today) return "Today";
  // Compare as plain dates (no time-of-day math needed, keys are already YYYY-MM-DD)
  const pickupDate = new Date(`${key}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const diffDays = Math.round((pickupDate.getTime() - todayDate.getTime()) / 86_400_000);
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return pickupDate.toLocaleDateString("en-MY", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: diffDays > 300 || diffDays < -300 ? "numeric" : undefined });
}

function formatPickupTimeOfDay(order: Order): string | null {
  if (!order.pickup_time) return null;
  return new Date(order.pickup_time).toLocaleString("en-MY", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

type DateFilter = "today" | "upcoming" | "all";

const FILTERS: { key: DateFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Customers picking a slot days out kept mistaking it for "today" -- default
  // to showing only today's pickups, with an easy escape hatch to see the rest.
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");

  useEffect(() => {
    let stopped = false;
    let firstLoad = true;

    async function fetchOrders() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          throw new Error("You must be logged in to view your orders.");
        }

        const res = await fetch(`${BACKEND_URL}/users/me/orders`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to fetch order history.");

        const data = await res.json();
        if (!stopped) { setOrders(data); setError(null); }
      } catch (err: any) {
        // Only surface an error on the first load — a background refresh
        // hiccup shouldn't blank out a list the customer can already see.
        if (!stopped && firstLoad) setError(err.message);
      } finally {
        if (!stopped) setLoading(false);
        firstLoad = false;
      }
    }

    fetchOrders();
    // Same live-refresh pattern as the single-order page: poll while the tab
    // is actually visible, so a status change (preparing/ready/rejected) shows
    // up here without the customer needing to manually reload.
    const timer = setInterval(() => { if (!document.hidden) fetchOrders(); }, 15_000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);

  const visibleOrders = useMemo(() => {
    if (dateFilter === "all") return orders;
    const today = todayKey();
    return orders.filter((order) => {
      const key = orderDateKey(order);
      // An order with no pickup date on file (very old, pre-dates this field)
      // always needs a human to look at it -- never hide it behind a filter.
      if (!key) return true;
      if (dateFilter === "today") return key === today;
      return key > today; // upcoming
    });
  }, [orders, dateFilter]);

  const todayCount = useMemo(() => {
    const today = todayKey();
    return orders.filter((order) => { const k = orderDateKey(order); return !k || k === today; }).length;
  }, [orders]);

  return (
    <main className="min-h-screen bg-[#faf8f3] px-4 py-6 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <BackLink href="/profile" className="mb-6">Back to my account</BackLink>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-gray-900">My Order History</h1>
        </div>

        {/* Date filter -- "Today" by default so a slot picked days out never gets mistaken for today's order */}
        <div className="mb-6 flex bg-gray-100 p-1 rounded-xl text-xs font-semibold w-fit">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateFilter(f.key)}
              className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                dateFilter === f.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {f.label}
              {f.key === "today" && todayCount > 0 && (
                <span className="ml-1.5 text-orange-600">{todayCount}</span>
              )}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-500">Loading your orders...</p>}
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 border border-red-100">{error}</div>}

        {!loading && !error && orders.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
            <p className="text-gray-500 mb-4">You haven't placed any orders yet.</p>
            <Link href="/" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-blue-700">
              Start Shopping
            </Link>
          </div>
        )}

        {!loading && !error && orders.length > 0 && visibleOrders.length === 0 && (
          <div className="bg-white rounded-xl p-8 text-center border border-dashed border-gray-200">
            <p className="text-gray-500">
              {dateFilter === "today" ? "No pickups scheduled for today." : "Nothing here."}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const isDraft = order.status === "draft";
            const pickupDateLabel = formatPickupDate(order);
            const pickupTimeLabel = formatPickupTimeOfDay(order);
            const isTodayPickup = pickupDateLabel === "Today";

            return (
              <Link 
                key={order.id} 
                href={isDraft ? `/checkout/success/${order.id}` : `/orders/${order.id}`}
                className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-300 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-center gap-4">
                  <div className="min-w-0">
                    {order.merchant_name && (
                      <p className="text-sm font-bold text-gray-900 truncate">{order.merchant_name}</p>
                    )}
                    <p className="text-xs text-gray-400 font-mono mb-1 break-all">ID: {order.id}</p>
                    <p className="text-sm text-gray-500">
                      Placed {new Date(order.created_at).toLocaleString("en-MY", { timeZone: TZ })}
                    </p>

                    {(pickupDateLabel || pickupTimeLabel) && (
                      <p className={`text-sm font-semibold mt-1 ${isTodayPickup ? "text-emerald-700" : "text-orange-700"}`}>
                        🕐 Pickup: {pickupDateLabel ?? ""}{pickupDateLabel && pickupTimeLabel ? ", " : ""}{pickupTimeLabel ?? ""}
                      </p>
                    )}

                    <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                      order.status === 'completed' 
                        ? 'bg-green-100 text-green-700' 
                        : order.status === 'draft'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'rejected' || order.status === 'cancelled'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-lg font-bold text-gray-900">
                      RM {Number(order.total_price).toFixed(2)}
                    </span>
                    {isDraft ? (
                      <p className="text-xs text-amber-600 font-bold mt-1 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 inline-block">
                        Complete Payment →
                      </p>
                    ) : (
                      <p className="text-xs text-blue-600 font-medium mt-1">View Receipt →</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
