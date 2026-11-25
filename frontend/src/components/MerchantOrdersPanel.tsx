"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import type { Dispatch, SetStateAction } from "react";
import type { Order } from "@/lib/merchant-dashboard-types";

const ORDER_STATUS_META: Record<string, { label: string; badge: string; accent: string }> = {
  pending_verification: { label: "Verifying Payment", badge: "bg-amber-100 text-amber-800", accent: "border-l-amber-400" },
  pending: { label: "Verifying Payment", badge: "bg-amber-100 text-amber-800", accent: "border-l-amber-400" },
  preparing: { label: "Preparing", badge: "bg-blue-100 text-blue-800", accent: "border-l-blue-400" },
  ready: { label: "Ready for Pickup", badge: "bg-emerald-100 text-emerald-800", accent: "border-l-emerald-400" },
  completed: { label: "Completed", badge: "bg-stone-100 text-stone-600", accent: "border-l-stone-300" },
  rejected: { label: "Rejected", badge: "bg-red-100 text-red-800", accent: "border-l-red-400" },
  cancelled: { label: "Cancelled", badge: "bg-red-100 text-red-800", accent: "border-l-red-400" },
};
const DEFAULT_STATUS_META = { badge: "bg-stone-100 text-stone-600", accent: "border-l-stone-300" };
function statusMeta(status: string) {
  return ORDER_STATUS_META[status] || { ...DEFAULT_STATUS_META, label: status };
}

const ORDER_FILTERS: { key: string; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending_verification", label: "Pending Verification" },
  { key: "preparing", label: "Preparing" },
  { key: "completed", label: "Completed" },
];
// "Active" means not yet closed out -- the order still needs the vendor's
// attention in some way, whether that's verifying payment, cooking, or
// waiting for the customer to collect it. Only Completed/Rejected/Cancelled
// orders are truly done and drop out of this view.
const ACTIVE_STATUSES = new Set(["pending", "pending_verification", "preparing", "ready"]);

interface MerchantOrdersPanelProps {
  orders: Order[];
  orderFilter: string;
  setOrderFilter: Dispatch<SetStateAction<string>>;
  orderError: string;
  updatingOrderId: string | null;
  updatingOrderAction: string | null;
  rejectingOrderId: string | null;
  setRejectingOrderId: Dispatch<SetStateAction<string | null>>;
  rejectionReason: string;
  setRejectionReason: Dispatch<SetStateAction<string>>;
  rejectionNote: string;
  setRejectionNote: Dispatch<SetStateAction<string>>;
  onUpdateOrderStatus: (orderId: string, status: string, rejection?: { reason: string; note: string }) => Promise<void>;
}

export default function MerchantOrdersPanel({
  orders, orderFilter, setOrderFilter, orderError,
  updatingOrderId, updatingOrderAction, rejectingOrderId, setRejectingOrderId,
  rejectionReason, setRejectionReason, rejectionNote, setRejectionNote,
  onUpdateOrderStatus,
}: MerchantOrdersPanelProps) {
  const filteredOrders = orders.filter((order) =>
    orderFilter === "all" ||
    (orderFilter === "active" ? ACTIVE_STATUSES.has(order.status) : order.status === orderFilter)
  );
  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
      <h2 className="scroll-mt-6 text-xl font-bold text-gray-900">Manage Orders</h2>
      <p className="text-sm text-stone-500">Updates every 15 seconds while this page is visible. Verify payment in your banking app before accepting.</p>

      <details className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4 sm:p-5">
        <summary className="cursor-pointer text-sm font-bold text-orange-900">👋 New here? How to process an order (3 steps)</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-orange-100 bg-white p-3">
            <p className="text-sm font-bold text-slate-900">1️⃣ Verify &amp; Accept</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">Open the customer’s payment receipt and check the items and quantities in their order. If the amount paid matches the order total, tap <strong>Verify &amp; Accept</strong>.</p>
            <p className="mt-1.5 text-xs text-slate-400">The customer will see their order status change to <strong>Preparing</strong>.</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white p-3">
            <p className="text-sm font-bold text-slate-900">2️⃣ Mark Ready</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">Once the full order is packed and ready for pickup, tap <strong>Mark Ready</strong>.</p>
            <p className="mt-1.5 text-xs text-slate-400">The customer will be notified that their food is ready to collect.</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-white p-3">
            <p className="text-sm font-bold text-slate-900">3️⃣ Mark Collected</p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">After handing the food to the customer, tap <strong>Mark Collected</strong>.</p>
            <p className="mt-1.5 text-xs italic text-slate-400">The customer will receive their invoice, and the order will be closed.</p>
          </div>
        </div>
      </details>

      {orderError && <p role="alert" className="text-sm text-red-700">{orderError}</p>}
      <nav aria-label="Order status" className="flex flex-wrap gap-2">
        {ORDER_FILTERS.map(f => (
          <button key={f.key} onClick={() => setOrderFilter(f.key)} aria-pressed={orderFilter === f.key}
            className={`rounded-full px-3 py-2 text-xs font-semibold ${orderFilter === f.key ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700"}`}>
            {f.label}
          </button>
        ))}
      </nav>
      {filteredOrders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center text-sm text-stone-600">
          {orders.length === 0 ? "No orders yet." : "No orders in this category."}
        </p>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div key={order.id} className={`rounded-2xl border border-gray-200 border-l-4 ${statusMeta(order.status).accent} bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                <p className="font-mono text-xs text-gray-400">{order.order_number || `#EX-${order.id.slice(0, 6)}`}</p>
                <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusMeta(order.status).badge}`}>{statusMeta(order.status).label}</span>
              </div>

              {/* Customer + pickup slot: the two things a vendor needs at a glance.
                  Pickup slot is the most prominent element on the card -- it's what
                  determines when the food needs to be ready, so it can't be missed. */}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-gray-900 sm:text-xl">{order.customer_name || "Customer"}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    Placed {new Date(order.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {order.pickup_time && (
                  <div className="shrink-0 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-center sm:text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-orange-500">Pickup slot</p>
                    <p className="text-xl font-black leading-tight text-orange-700 sm:text-2xl">
                      {new Date(order.pickup_time).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[11px] font-semibold text-orange-500">
                      {new Date(order.pickup_time).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short" })}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Items</p>
                {!order.items || order.items.length === 0 ? (
                  <p className="text-xs text-gray-400">No items found.</p>
                ) : (
                  <ul className="space-y-2">
                    {order.items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium text-gray-800">{item.name}</span>
                          {item.surplus_offer_id && <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-800">Deal</span>}
                          <span className="ml-1.5 text-gray-400">×{item.quantity}</span>
                          {item.special_instructions && (
                            <p className="mt-1 rounded-md bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700">
                              Note: {item.special_instructions}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 text-gray-700">RM {Number(item.price_at_order * item.quantity).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {order.transaction_ref && (
                <a href={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`} target="_blank" rel="noopener noreferrer"
                  className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:bg-stone-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`}
                    alt="Payment receipt screenshot" loading="lazy" className="h-10 w-10 shrink-0 rounded-lg border border-stone-200 object-cover" />
                  <div className="text-xs">
                    <p className="font-semibold text-stone-700">Payment receipt uploaded</p>
                    <p className="text-stone-400">Tap to view full size</p>
                  </div>
                </a>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total</p>
                  <p className="text-base font-bold text-gray-900">RM {Number(order.total_price).toFixed(2)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(order.status === "pending_verification" || order.status === "pending") && (
                    <button onClick={() => { setRejectingOrderId(order.id); setRejectionReason("item_sold_out"); setRejectionNote(""); }}
                      disabled={updatingOrderId === order.id}
                      className="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60">
                      {updatingOrderId === order.id && updatingOrderAction === "rejected" ? "Updating…" : "Reject"}
                    </button>
                  )}
                  {order.status === "pending_verification" && (
                    <button onClick={() => onUpdateOrderStatus(order.id, "preparing")}
                      disabled={updatingOrderId === order.id}
                      className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm disabled:cursor-wait disabled:opacity-60">
                      {updatingOrderId === order.id && updatingOrderAction === "preparing" ? "Updating…" : "Verify & Accept"}
                    </button>
                  )}
                  {order.status === "pending" && (
                    <button onClick={() => onUpdateOrderStatus(order.id, "preparing")}
                      disabled={updatingOrderId === order.id}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60">
                      {updatingOrderId === order.id && updatingOrderAction === "preparing" ? "Updating…" : "Start Preparing"}
                    </button>
                  )}
                  {order.status === "ready" && (
                    <button onClick={() => onUpdateOrderStatus(order.id, "completed")}
                      disabled={updatingOrderId === order.id}
                      className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                      {updatingOrderId === order.id && updatingOrderAction === "completed" ? "Updating…" : "Mark Collected"}
                    </button>
                  )}
                  {order.status === "preparing" && (
                    <button onClick={() => onUpdateOrderStatus(order.id, "ready")}
                      disabled={updatingOrderId === order.id}
                      className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60">
                      {updatingOrderId === order.id && updatingOrderAction === "ready" ? "Updating…" : "Mark Ready"}
                    </button>
                  )}
                </div>
              </div>
              {rejectingOrderId === order.id && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-bold text-red-900">Why are you rejecting this paid order?</p>
                    <p className="mt-1 text-xs text-red-700">Sold-out and unable-to-fulfil reasons automatically open a tracked refund case. Invalid payment does not.</p>
                  </div>
                  <select value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="item_sold_out">Item sold out</option>
                    <option value="stall_unable">Stall unable to fulfil order</option>
                    <option value="invalid_payment">Payment receipt invalid / unmatched</option>
                    <option value="other">Other paid-order fulfilment problem</option>
                  </select>
                  <textarea value={rejectionNote} onChange={(e) => setRejectionNote(e.target.value)} maxLength={500}
                    placeholder="Give the customer a clear, short explanation…" className="w-full rounded-xl border border-red-200 bg-white p-3 text-sm text-slate-800" />
                  {orderError && (
                    <p role="alert" className="rounded-xl border border-red-300 bg-white p-3 text-sm font-semibold text-red-800">
                      {orderError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button type="button" disabled={updatingOrderId === order.id}
                      onClick={() => onUpdateOrderStatus(order.id, "rejected", { reason: rejectionReason, note: rejectionNote })}
                      className="rounded-xl bg-red-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                      {updatingOrderId === order.id && updatingOrderAction === "rejected" ? "Rejecting…" : "Confirm rejection"}
                    </button>
                    <button type="button" onClick={() => setRejectingOrderId(null)} className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
