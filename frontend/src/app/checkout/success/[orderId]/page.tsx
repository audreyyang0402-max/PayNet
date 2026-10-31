// src/app/checkout/success/[id]/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function OrderVerificationPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<any>(null);
  const [merchant, setMerchant] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    localStorage.removeItem("cart");

    // 1. Fetch order details from FastAPI
    fetch(`${BACKEND_URL}/orders/${orderId}`)
      .then((res) => res.json())
      .then((data) => {
        setOrder(data);
        // 2. Once order is fetched, fetch the merchant's DuitNow QR URL
        if (data.merchant_id) {
          fetch(`${BACKEND_URL}/merchants`)
            .then((res) => res.json())
            .then((merchants) => {
              const found = merchants.find((m: any) => m.id === data.merchant_id);
              setMerchant(found);
            });
        }
      })
      .catch((err) => console.error("Failed to load order:", err));
  }, [orderId]);

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = document.getElementById("receipt-file") as HTMLInputElement;
    if (!fileInput?.files?.[0]) {
      alert("Please select a payment screenshot image.");
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem("token") || localStorage.getItem("access_token");
      const formData = new FormData();
      formData.append("receipt_file", fileInput.files[0]);

      const res = await fetch(`${BACKEND_URL}/orders/${orderId}/submit-receipt`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Failed to upload receipt. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Network error. Please check if your FastAPI backend is running.");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to download the QR code image
  const handleDownloadQR = async () => {
    try {
      const response = await fetch(qrImageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${merchant?.name || "Vendor"}-DuitNow-QR.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download QR image:", err);
      // Fallback: Open image in new tab if direct download fails due to CORS
      window.open(qrImageUrl, "_blank");
    }
  };

  if (!order) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading order details...</div>;
  }

  const qrImageUrl = merchant?.duitnow_qr_url?.startsWith("http") 
    ? merchant.duitnow_qr_url 
    : merchant?.duitnow_qr_url 
      ? `${BACKEND_URL}${merchant.duitnow_qr_url}` 
      : "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=DuitNow-QR-Placeholder";

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ⏳
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Scan & Pay via DuitNow</h1>
        <p className="text-gray-500 text-sm mb-6">
          Scan the vendor's QR code with your banking app, transfer the exact amount, and upload your transfer screenshot below.
        </p>

        {/* Order Summary & QR Code Display */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left border border-gray-100 text-sm space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">Order Number:</span>
            <span className="font-bold text-blue-600">{order.order_number || `#EX-${orderId.slice(0, 4)}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total Amount:</span>
            <span className="font-bold text-gray-900 text-base">RM {order.total_price.toFixed(2)}</span>
          </div>

          {/* Display Vendor DuitNow QR Image with Click-to-Enlarge & Download */}
          <div className="mt-4 pt-3 border-t border-gray-200 text-center">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              Vendor DuitNow QR ({merchant?.name || "Stall"}):
            </p>
            
            <div 
              onClick={() => setIsZoomed(true)}
              className="relative group cursor-pointer inline-block bg-white p-2 rounded-lg border border-gray-200 shadow-sm transition hover:shadow-md hover:border-blue-500"
            >
              <img 
                src={qrImageUrl} 
                alt="Vendor DuitNow QR" 
                className="w-48 h-48 mx-auto object-contain transition group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center">
                <span className="bg-gray-900/80 text-white text-[10px] px-2 py-1 rounded-md font-medium shadow">Click to Enlarge / Download</span>
              </div>
            </div>

            {/* Quick Download Button below thumbnail */}
            <div className="mt-2">
              <button
                type="button"
                onClick={handleDownloadQR}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                📥 Download QR Image
              </button>
            </div>
          </div>
        </div>

        {/* Full-Screen Zoom Modal with Download Button */}
        {isZoomed && (
          <div 
            onClick={() => setIsZoomed(false)}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <div 
              onClick={(e) => e.stopPropagation()} 
              className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full flex flex-col items-center relative space-y-4 text-center"
            >
              <div className="flex justify-between items-center w-full">
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">Scan DuitNow QR</h3>
                <button 
                  onClick={() => setIsZoomed(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm font-bold rounded-full bg-gray-100 hover:bg-gray-200 w-8 h-8 flex items-center justify-center transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 w-full flex justify-center">
                <img 
                  src={qrImageUrl} 
                  alt="Enlarged Vendor DuitNow QR" 
                  className="w-72 h-72 object-contain"
                />
              </div>

              <p className="text-xs text-gray-500">
                Tap download to save the QR code to your phone gallery, then upload from your banking app.
              </p>

              <div className="w-full space-y-2">
                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  📥 Download QR Code Image
                </button>

                <button 
                  onClick={() => setIsZoomed(false)}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {!submitted ? (
          <form onSubmit={handleSubmitReceipt} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Upload Payment Screenshot / Receipt:
              </label>
              <div className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white flex items-center">
                <input
                  id="receipt-file"
                  type="file"
                  accept="image/*"
                  required
                  className="w-full text-xs text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-sm text-sm cursor-pointer"
            >
              {loading ? "Uploading Screenshot..." : "Submit Payment Screenshot"}
            </button>
          </form>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
            <h3 className="font-bold text-green-800 text-sm">Screenshot Submitted!</h3>
            <p className="text-xs text-green-600">
              Your status is now <span className="font-semibold">Pending Vendor Verification</span>. Once the vendor reviews your screenshot, your live prep timer will start!
            </p>
            <Link
              href="/orders"
              className="inline-block mt-3 bg-green-600 text-white font-bold px-4 py-2 rounded-lg text-xs"
            >
              View My Orders
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}