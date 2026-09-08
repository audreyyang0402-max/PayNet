// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Order {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
}

export default function ProfileDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/login");
          return;
        }

        // 1. Fetch User Profile Info (/auth/me)
        const userRes = await fetch("http://127.0.0.1:8000/auth/me", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!userRes.ok) throw new Error("Failed to authenticate session.");
        const userData = await userRes.json();
        setUser(userData);

        // 2. Fetch User Order History (/users/me/orders)
        const ordersRes = await fetch("http://127.0.0.1:8000/users/me/orders", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          setOrders(ordersData);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("cart");
    router.push("/login");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 font-medium">Loading your profile dashboard...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Top Bar */}
        <div className="flex justify-between items-center mb-8">
          <Link href="/" className="text-blue-600 hover:underline text-sm font-medium">
            ← Back to Home
          </Link>
          <button
            onClick={handleLogout}
            className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
          >
            Log Out
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 font-medium">
            {error}
          </div>
        )}

        {/* User Info Card */}
        {user && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  {user.role} Account
                </span>
                <h1 className="text-2xl font-bold text-gray-900 mt-2">{user.name}</h1>
                <p className="text-gray-500 text-sm">{user.email}</p>
              </div>
              <div className="text-right bg-gray-50 p-4 rounded-xl border border-gray-100 w-full sm:w-auto">
                <p className="text-xs text-gray-400 font-medium">Total Orders Placed</p>
                <p className="text-xl font-bold text-gray-900">{orders.length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Orders & Receipts Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Order History & Receipts</h2>

          {orders.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-xl">
              <p className="text-gray-400 text-sm mb-4">You haven't placed any orders yet.</p>
              <Link href="/" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all">
                Browse Merchants
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block p-5 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <p className="text-xs font-mono text-gray-400">Order ID: {order.id}</p>
                      <p className="text-sm font-medium text-gray-700 mt-1">
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
                    <div className="text-left sm:text-right mt-2 sm:mt-0">
                      <p className="text-lg font-bold text-gray-900">
                        RM {Number(order.total_price).toFixed(2)}
                      </p>
                      <span className="text-xs text-blue-600 font-semibold hover:underline">
                        View Full Receipt →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}