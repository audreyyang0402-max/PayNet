// src/app/orders/[id]/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";

interface OrderDetail {
  id: string;
  merchant_id: string;
  merchant_name?: string | null;
  merchant_location?: string | null;
  status: string;
  total_price: number;
  created_at: string;
  order_number?: string | null;
  pickup_time?: string | null;
  transaction_ref?: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price_at_order: number;
    special_instructions?: string | null;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Awaiting Payment",
  pending_verification: "Verifying Payment",
  pending: "Verifying Payment",
  preparing: "Preparing",
  ready: "Ready For Pickup",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  ready: "bg-emerald-100 text-emerald-700",
  preparing: "bg-blue-100 text-blue-700",
  pending_verification: "bg-yellow-100 text-yellow-700",
  pending: "bg-yellow-100 text-yellow-700",
  draft: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function OrderReceiptPage() {
  const params = useParams();
  const orderId = params.id;

  const [data, setData] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrderDetails() {
      if (!orderId) return;
      try {
        const token = localStorage.getItem("token");
        if (!token) throw new Error("You must be logged in to view this order.");

        const res = await fetch(`${BACKEND_URL}/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error("Failed to load this order.");

        const result = await res.json();
        setData(result);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchOrderDetails();
  }, [orderId]);

  const statusLabel = data ? (STATUS_LABELS[data.status] || data.status) : "";
  const statusStyle = data ? (STATUS_STYLES[data.status] || "bg-gray-200 text-gray-800") : "";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:p-8">
      <div className="max-w-xl mx-auto">
        <BackLink href="/orders" className="mb-6">Back to Order History</BackLink>

        {loading && <p className="text-gray-500">Loading order...</p>}
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 border border-red-100">{error}</div>}

        {data && (
          <div className="space-y-5">

            {/* Proof-of-order banner */}
            {(data.status === "preparing" || data.status === "ready" || data.status === "pending_verification" || data.status === "pending") && (
              <div className="rounded-2xl bg-slate-900 text-white px-5 py-4 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-1">Proof of Order</p>
                <p className="text-sm text-slate-100">Show this screen to the stall at pickup if asked.</p>
              </div>
            )}

            {/* Rejected-order banner: explains why and points to a fresh order */}
            {data.status === "rejected" && (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-center space-y-3">
                <p className="text-sm font-semibold text-red-800">
                  This order was rejected — the stall could not verify your payment receipt.
                </p>
                <p className="text-xs text-red-600">
                  Your pickup slot has been released. Please place a new order and upload a clear, matching payment receipt.
                </p>
                {data.merchant_id && (
                  <Link
                    href={`/merchants/${data.merchant_id}`}
                    className="inline-block rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 transition"
                  >
                    Order again from this stall →
                  </Link>
                )}
              </div>
            )}

            {/* Header card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-5">
              <div className="flex justify-between items-start border-b border-gray-100 pb-5">
                <div>
                  <p className="text-xs text-gray-400 font-mono">Order Number</p>
                  <p className="text-lg font-black text-gray-900">{data.order_number || `#${data.id.slice(0, 8).toUpperCase()}`}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(data.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusStyle}`}>
                  {statusLabel}
                </span>
              </div>

              {/* Merchant + pickup info */}
              {(data.merchant_name || data.pickup_time) && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-sm space-y-1">
                  {data.merchant_name && (
                    <p className="font-bold text-gray-900">📍 {data.merchant_name}</p>
                  )}
                  {data.merchant_location && (
                    <p className="text-gray-600">{data.merchant_location}</p>
                  )}
                  {data.pickup_time && (
                    <p className="text-gray-700 mt-1">
                      🕐 Pickup slot: <strong>{new Date(data.pickup_time).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" })}</strong>
                    </p>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Items Ordered</h2>
                <div className="space-y-3">
                  {data.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-start gap-4 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900">{item.name}</span>
                        <span className="text-gray-500 ml-2">x{item.quantity}</span>
                        {item.special_instructions && (
                          <p className="mt-1 text-xs leading-relaxed text-orange-700">{item.special_instructions}</p>
                        )}
                      </div>
                      <span className="font-medium text-gray-900">
                        RM {(Number(item.price_at_order) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5 flex justify-between items-center">
                <span className="text-base font-bold text-gray-900">Total Paid</span>
                <span className="text-2xl font-bold text-blue-600">
                  RM {Number(data.total_price).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment receipt */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Payment Receipt</h2>
              {data.transaction_ref ? (
                <a href={data.transaction_ref} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={data.transaction_ref}
                    alt="Payment receipt screenshot"
                    className="w-full max-w-xs mx-auto rounded-xl border border-gray-200 object-contain hover:opacity-90 transition cursor-pointer"
                  />
                  <p className="text-center text-xs text-gray-400 mt-2">Tap to view full size</p>
                </a>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No receipt uploaded for this order yet.</p>
              )}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
