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
  phone_number?: string;
}

interface OrderItem {
  id: string;
  quantity: number;
  price_at_order: number;
  menu_item_id: string;
}

interface OrderWithItems {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
  items: OrderItem[];
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Profile States
  const [isEditing, setIsEditing] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [updateSuccess, setUpdateSuccess] = useState("");
  
  // Persist dismissal using localStorage so it stays closed across page navigation
  const [dismissedReady, setDismissedReady] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("dismissedReady") === "true";
    }
    return false;
  });

  useEffect(() => {
    async function loadProfileData() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/vendor/login" as any);
          return;
        }

        // 1. Fetch current user info
        const userRes = await fetch("http://127.0.0.1:8000/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userRes.ok) throw new Error("Failed to load user profile.");
        const userData = await userRes.json();
        setUser(userData);
        setEditEmail(userData.email);
        setEditPhone(userData.phone_number || "");

        // 2. Fetch customer orders and line items (if they are a customer)
        if (userData.role === "customer") {
          const ordersRes = await fetch("http://127.0.0.1:8000/users/me/orders", {
            headers: { Authorization: `Bearer ${token}` },
          });
          
          if (ordersRes.ok) {
            const baseOrders = await ordersRes.json();

            // Fetch detailed line items for each order to build the receipt
            const detailedOrders = await Promise.all(
              baseOrders.map(async (order: any) => {
                try {
                  const detailRes = await fetch(`http://127.0.0.1:8000/orders/${order.id}`);
                  if (detailRes.ok) {
                    const detailData = await detailRes.json();
                    return { ...order, items: detailData.items || [] };
                  }
                } catch {
                  // fallback if detail fails
                }
                return { ...order, items: [] };
              })
            );

            setOrders(detailedOrders);
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();

    // Poll every 10 seconds to auto-detect when merchant updates order status to ready
    const interval = setInterval(loadProfileData, 10000);
    return () => clearInterval(interval);
  }, [router]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateSuccess("");
    setError(null);

    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        email: editEmail,
        phone_number: editPhone,
      };
      if (editPassword) {
        payload.password = editPassword;
      }

      const res = await fetch("http://127.0.0.1:8000/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update profile.");
      }

      const updatedData = await res.json();
      setUser((prev) => prev ? { ...prev, email: updatedData.email, phone_number: updatedData.phone_number } : null);
      setUpdateSuccess("Profile updated successfully!");
      setEditPassword("");
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    localStorage.removeItem("dismissedReady"); // Clears notification dismissal on logout
    setDismissedReady(false);
    router.push("/vendor/login" as any);
  };

  // Check if any order is ready for pickup
  const readyOrders = orders.filter((o) => o.status.toLowerCase() === "ready");

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading profile...</div>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl">{error}</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation & Logout Header */}
        <div className="flex justify-between items-center">
          <Link href="/checkout" className="text-orange-600 hover:underline font-medium text-sm">
            ← Back to Marketplace
          </Link>
          <div className="space-x-4">
            {user?.role === "merchant" && (
              <Link 
                href="/vendor/dashboard"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-all"
              >
                Go to Vendor Dashboard
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white border border-gray-200 hover:border-red-300 text-gray-600 hover:text-red-600 text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* User Card & Edit Profile Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block ${
                user?.role === 'merchant' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'
              }`}>
                {user?.role === 'merchant' ? 'Merchant Account' : 'Customer Account'}
              </span>
              <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>
              <p className="text-gray-500 text-sm">📧 {user?.email}</p>
              {user?.phone_number && (
                <p className="text-gray-500 text-sm mt-1">📞 {user.phone_number}</p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              {user?.role === 'customer' && (
                <div className="text-right bg-gray-50 p-3 rounded-xl border border-gray-100 hidden sm:block">
                  <p className="text-xs text-gray-400 uppercase font-semibold">Total Orders</p>
                  <p className="text-xl font-bold text-gray-900">{orders.length}</p>
                </div>
              )}
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="px-3.5 py-2 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
              >
                {isEditing ? "Cancel" : "Edit Profile"}
              </button>
            </div>
          </div>

          {updateSuccess && (
            <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl">{updateSuccess}</div>
          )}

          {isEditing && (
            <form onSubmit={handleUpdateProfile} className="space-y-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Update Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Update Phone Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="+60123456789"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Save Changes
              </button>
            </form>
          )}
        </div>

        {/* Notification Banner for Ready Orders */}
        {readyOrders.length > 0 && !dismissedReady && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-2xl shadow-sm flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-3">
              <span className="text-2xl">🔔</span>
              <div>
                <h3 className="font-bold text-green-800 text-sm">Action Required: Food is Ready!</h3>
                <p className="text-xs text-green-700">You have {readyOrders.length} order(s) marked as ready. Head over to the stall to pick up your food!</p>
              </div>
            </div>
            <button
              onClick={() => {
                setDismissedReady(true);
                localStorage.setItem("dismissedReady", "true");
              }}
              className="text-green-700 hover:text-green-900 font-bold text-sm px-2 py-1 cursor-pointer transition-colors"
              title="Dismiss notification"
            >
              ✕
            </button>
          </div>
        )}

        {/* Order History Section (Only shown for customers) */}
        {user?.role === 'customer' && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Order History & Receipts</h2>
            {orders.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl space-y-3">
                <p className="text-gray-500 text-sm">You haven't placed any orders yet.</p>
                <Link
                  href="/checkout"
                  className="inline-block px-4 py-2 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-all"
                >
                  Browse Merchants
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div key={order.id} className="p-5 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs text-gray-400 font-mono">Order ID: {order.id}</p>
                        <p className="text-xs text-gray-500 mt-0.5">Placed on: {new Date(order.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md uppercase ${
                        order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                        order.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    {/* Itemized Receipt breakdown */}
                    <div className="border-t border-gray-200 pt-3 space-y-1">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Receipt Items:</p>
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-600">
                          <span>Item ID: {item.menu_item_id.slice(0, 8)}... (x{item.quantity})</span>
                          <span>RM {Number(item.price_at_order * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-gray-200 pt-3 flex justify-between items-center font-bold text-gray-900">
                      <span className="text-xs uppercase text-gray-500">Total Paid</span>
                      <span className="text-orange-600 text-sm">RM {Number(order.total_price).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}