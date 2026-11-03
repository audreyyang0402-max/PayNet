// src/app/orders/[id]/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import CustomerRefundPanel, { RefundCase } from "@/components/CustomerRefundPanel";

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
  rejection_reason?: string | null;
  rejection_note?: string | null;
  refund?: RefundCase | null;
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
  const receiptRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"image" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let stopped = false;
    let firstLoad = true;
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
        if (!stopped) { setData(result); setError(null); }
      } catch (err: any) {
        if (!stopped && firstLoad) setError(err.message);
      } finally {
        if (!stopped) setLoading(false);
        firstLoad = false;
      }
    }

    fetchOrderDetails();
    const timer = setInterval(() => { if (!document.hidden) fetchOrderDetails(); }, 15_000);
    return () => { stopped = true; clearInterval(timer); };
  }, [orderId]);

  // Export libraries (html2canvas + jsPDF) are loaded from CDN on demand, not
  // bundled, so saving a receipt doesn't cost every visitor extra JS.
  function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (existing) {
        if ((existing as any)._loaded) { resolve(); return; }
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Could not load a required library. Check your connection and try again.")));
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => { (script as any)._loaded = true; resolve(); };
      script.onerror = () => reject(new Error("Could not load a required library. Check your connection and try again."));
      document.body.appendChild(script);
    });
  }

  async function ensureExportLibs(): Promise<{ html2canvas: any; jsPDF: any }> {
    if (!(window as any).html2canvas) {
      // html2canvas-pro, not the original html2canvas: this project's Tailwind v4
      // colors are oklch()/lab(), and only the "pro" fork can parse those —
      // same API and same window.html2canvas global, so nothing else changes.
      await loadScript("https://cdn.jsdelivr.net/npm/html2canvas-pro@2.6.0/dist/html2canvas-pro.min.js");
    }
    if (!(window as any).jspdf) {
      await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js");
    }
    return { html2canvas: (window as any).html2canvas, jsPDF: (window as any).jspdf.jsPDF };
  }

  const receiptFileBase = () => (data?.order_number || String(orderId || "receipt")).replace(/[^a-zA-Z0-9-]/g, "");

  const handleExportImage = async () => {
    if (!receiptRef.current || exporting) return;
    setExportError(""); setExporting("image");
    try {
      const { html2canvas } = await ensureExportLibs();
      const canvas = await html2canvas(receiptRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const link = document.createElement("a");
      link.download = `receipt-${receiptFileBase()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not save the receipt. Please try again.");
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    if (!receiptRef.current || exporting) return;
    setExportError(""); setExporting("pdf");
    try {
      const { html2canvas, jsPDF } = await ensureExportLibs();
      const canvas = await html2canvas(receiptRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`receipt-${receiptFileBase()}.pdf`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Could not save the receipt. Please try again.");
    } finally {
      setExporting(null);
    }
  };

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

            {/* Save/export receipt */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-xs text-gray-500 flex-1">Save a copy of this receipt to show at pickup or keep for your records.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleExportImage}
                  disabled={exporting !== null}
                  className="flex-1 sm:flex-none rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition"
                >
                  {exporting === "image" ? "Saving..." : "Save as Picture"}
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exporting !== null}
                  className="flex-1 sm:flex-none rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition"
                >
                  {exporting === "pdf" ? "Saving..." : "Save as PDF"}
                </button>
              </div>
              {exportError && <p className="text-xs text-red-600 w-full">{exportError}</p>}
            </div>

            {/* Rejected-order banner: explains why and points to a fresh order */}
            {data.status === "rejected" && (
              <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-center space-y-3">
                <p className="text-sm font-semibold text-red-800">
                  {data.refund
                    ? "The stall could not fulfil this paid order. Your refund case is ready below."
                    : "This order was rejected because the payment could not be accepted."}
                </p>
                <p className="text-xs text-red-600">
                  {data.rejection_note || (data.refund
                    ? "Your pickup slot was released. Choose a refund method and track every step on this receipt."
                    : "Your pickup slot was released. If you believe this is incorrect, please contact Payvolution support.")}
                </p>
                {!data.refund && data.merchant_id && (
                  <Link
                    href={`/merchants/${data.merchant_id}`}
                    className="inline-block rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800 transition"
                  >
                    Order again from this stall →
                  </Link>
                )}
              </div>
            )}

            {data.refund && (
              <CustomerRefundPanel
                orderId={data.id}
                refund={data.refund}
                onUpdated={(refund) => setData((current) => current ? { ...current, refund } : current)}
              />
            )}

            {/* Receipt (captured together for export) */}
            <div ref={receiptRef} className="space-y-5">

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
                    crossOrigin="anonymous"
                    className="w-full max-w-xs mx-auto rounded-xl border border-gray-200 object-contain hover:opacity-90 transition cursor-pointer"
                  />
                  <p className="text-center text-xs text-gray-400 mt-2">Tap to view full size</p>
                </a>
              ) : (
                <p className="text-sm text-gray-400 text-center py-6">No receipt uploaded for this order yet.</p>
              )}
            </div>

            </div>

          </div>
        )}
      </div>
    </main>
  );
}
