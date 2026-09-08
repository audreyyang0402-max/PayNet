// src/app/orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface OrderDetail {
  order: {
    id: string;
    status: string;
    total_price: number;
    created_at: string;
    pickup_slot_id: string;
  };
  items: Array<{
    id: string;
    menu_item_id: string;
    quantity: number;
    price_at_order: number;
  }>;
}

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
        if (!token) throw new Error("You must be logged in to view this receipt.");

        const res = await fetch(`http://127.0.0.1:8000/orders/${orderId}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to load order receipt.");

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

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-xl mx-auto">
        <Link href="/orders" className="text-blue-600 hover:underline text-sm font-medium mb-6 inline-block">
          ← Back to Order History
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">Order Receipt</h1>

        {loading && <p className="text-gray-500">Loading receipt...</p>}
        {error && <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-4 border border-red-100">{error}</div>}

        {data && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
            <div className="flex justify-between items-start border-b border-gray-100 pb-6">
              <div>
                <p className="text-xs text-gray-400 font-mono">Order ID</p>
                <p className="text-sm font-semibold text-gray-900">{data.order.id}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(data.order.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                data.order.status === 'completed' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {data.order.status}
              </span>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Items Ordered</h2>
              <div className="space-y-3">
                {data.items.map((item, index) => (
                  <div key={index} className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-medium text-gray-900">Item ID: {item.menu_item_id.slice(0, 8)}...</span>
                      <span className="text-gray-500 ml-2">x{item.quantity}</span>
                    </div>
                    <span className="font-medium text-gray-900">
                      RM {(Number(item.price_at_order) * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 pt-6 flex justify-between items-center">
              <span className="text-base font-bold text-gray-900">Total Paid</span>
              <span className="text-2xl font-bold text-blue-600">
                RM {Number(data.order.total_price).toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}