// src/app/orders/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Order {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          throw new Error("You must be logged in to view your orders.");
        }

        const res = await fetch("http://127.0.0.1:8000/users/me/orders", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to fetch order history.");

        const data = await res.json();
        setOrders(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, []);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-blue-600 hover:underline text-sm font-medium mb-6 inline-block">
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">My Order History</h1>

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

        <div className="space-y-4">
          {orders.map((order) => (
            <Link 
              key={order.id} 
              href={`/orders/${order.id}`}
              className="block bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-gray-400 font-mono mb-1">ID: {order.id}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(order.created_at).toLocaleString()}
                  </p>
                  <span className={`inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase ${
                    order.status === 'completed' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-gray-900">
                    RM {Number(order.total_price).toFixed(2)}
                  </span>
                  <p className="text-xs text-blue-600 font-medium mt-1">View Receipt →</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}