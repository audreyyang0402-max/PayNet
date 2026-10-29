// src/app/vendor/dashboard/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MerchantProfile {
  id: string;
  name: string;
  location: string;
  description: string;
  duitnow_qr_url?: string;
  is_temporary?: boolean;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price_at_order: number;
}

interface Order {
  id: string;
  order_number?: string;
  status: string;
  total_price: number;
  created_at: string;
  customer_id: string;
  customer_name?: string;
  transaction_ref?: string;
  items?: OrderItem[];
}

export default function MerchantDashboard() {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Merchant Profile States
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editStoreName, setEditStoreName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [profileUpdateSuccess, setProfileUpdateSuccess] = useState("");

  // DuitNow QR Management States (File Upload)
  const [qrUrl, setQrUrl] = useState("");
  const [qrUpdating, setQrUpdating] = useState(false);
  const [qrUpdateMessage, setQrUpdateMessage] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");

        if (!token || role !== "merchant") {
          router.push("/vendor/login" as any);
          return;
        }

        const profileRes = await fetch(`${BACKEND_URL}/merchants/me/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!profileRes.ok) throw new Error("Could not load merchant profile.");
        const profileData = await profileRes.json();
        
        const bookingsRes = await fetch(`${BACKEND_URL}/boulevard/my-bookings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        let hasActiveRentals = false;
        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          if (bookingsData.length > 0) {
            hasActiveRentals = true;
          }
        }

        setMerchant({ ...profileData, is_temporary: hasActiveRentals || profileData.location?.toLowerCase().includes("boulevard") });
        setEditStoreName(profileData.name || "");
        setEditLocation(profileData.location || "");
        setEditDescription(profileData.description || "");
        setQrUrl(profileData.duitnow_qr_url || "");

        const userRes = await fetch(`${BACKEND_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          setEditEmail(userData.email || "");
          setEditPhone(userData.phone_number || "");
        }

        const ordersRes = await fetch(`${BACKEND_URL}/merchants/${profileData.id}/orders`);
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

    loadDashboardData();
  }, [router]);

  const handleUpdateMerchantProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileUpdateSuccess("");
    setError(null);

    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        email: editEmail,
        phone_number: editPhone,
        store_name: editStoreName,
        location: editLocation,
        description: editDescription,
      };
      if (editPassword) {
        payload.password = editPassword;
      }

      const res = await fetch(`${BACKEND_URL}/merchants/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update merchant profile.");
      }

      const updated = await res.json();
      setMerchant((prev) => prev ? { ...prev, name: updated.store_name, location: updated.location, description: updated.description } : null);
      setProfileUpdateSuccess("Store profile updated successfully!");
      setEditPassword("");
      setIsEditingProfile(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUploadQR = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = document.getElementById("merchant-qr-file") as HTMLInputElement;
    if (!fileInput?.files?.[0]) {
      alert("Please select a QR code image file.");
      return;
    }

    setQrUpdating(true);
    setQrUpdateMessage("");
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("qr_file", fileInput.files[0]);

      const res = await fetch(`${BACKEND_URL}/merchants/me/qr-upload`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setQrUpdateMessage("DuitNow QR uploaded successfully!");
        setMerchant((prev) => prev ? { ...prev, duitnow_qr_url: data.duitnow_qr_url } : null);
        setQrUrl(data.duitnow_qr_url);
      } else {
        alert("Failed to upload QR code.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setQrUpdating(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update order status.");
      }

      setOrders(orders.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/vendor/login" as any);
  };

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_price), 0);
  const completedOrdersCount = orders.filter(
    (o) => o.status.toLowerCase() === 'completed' || o.status.toLowerCase() === 'ready'
  ).length;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl">{error}</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <span className="bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
                Merchant Portal
              </span>
              <h1 className="text-2xl font-bold text-gray-900">{merchant?.name}</h1>
              <p className="text-gray-500 text-sm">📍 {merchant?.location}</p>
              {merchant?.description && (
                <p className="text-gray-600 text-xs mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {merchant.description}
                </p>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <Link href="/vendor/analytics" className="px-3.5 py-2 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors">
                Analytics
              </Link>
              <Link href="/vendor/menu" className="px-3.5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-xl transition-colors shadow-sm">
                Manage Menu & Slots
              </Link>
              {merchant?.is_temporary && (
                <Link
                  href="/vendor/rental"
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-gray-800 hover:bg-gray-900 rounded-xl transition-colors shadow-sm"
                >
                  Manage Stall Rental
                </Link>
              )}

              <button
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                className="px-3.5 py-2 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
              >
                {isEditingProfile ? "Cancel" : "Edit Store Profile"}
              </button>
              <button 
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-600 text-sm font-medium transition-colors cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>

          {profileUpdateSuccess && (
            <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl">{profileUpdateSuccess}</div>
          )}

          {isEditingProfile && (
            <form onSubmit={handleUpdateMerchantProfile} className="space-y-4 pt-4 border-t border-gray-100">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Store / Stall Name</label>
                  <input
                    type="text"
                    required
                    value={editStoreName}
                    onChange={(e) => setEditStoreName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Campus Location</label>
                  <input
                    type="text"
                    required
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Store Bio & Opening Hours</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="Operating Hours: Mon-Fri 8 AM - 5 PM"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="+60123456789"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">New Password</label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="Leave blank to keep"
                  />
                </div>
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

        {/* DuitNow QR Code Management Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-1">DuitNow QR Management</h2>
          <p className="text-xs text-gray-500 mb-4">
            Upload your static DuitNow QR image file so customers can scan it during checkout.
          </p>

          <form onSubmit={handleUploadQR} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Upload QR Image File
              </label>
              <input
                id="merchant-qr-file"
                type="file"
                accept="image/*"
                required
                className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
              />
            </div>

            {qrUrl && (
              <div className="text-center py-3 bg-gray-50 rounded-xl border border-gray-100 max-w-xs">
                <p className="text-xs font-semibold text-gray-600 mb-2">Current QR Code:</p>
                <img 
                  src={qrUrl.startsWith("http") ? qrUrl : `${BACKEND_URL}${qrUrl}`} 
                  alt="DuitNow QR Preview" 
                  className="w-36 h-36 mx-auto object-contain bg-white rounded-lg border p-1" 
                />
              </div>
            )}

            {qrUpdateMessage && (
              <p className="text-xs font-semibold text-green-600">{qrUpdateMessage}</p>
            )}

            <button
              type="submit"
              disabled={qrUpdating}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              {qrUpdating ? "Uploading..." : "Upload QR Code"}
            </button>
          </form>
        </div>

        {/* Sales Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Revenue</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">RM {totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{orders.length}</p>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fulfilled / Ready</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{completedOrdersCount}</p>
          </div>
        </div>

        {/* Incoming Orders Section */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Incoming Orders</h2>
          {orders.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
              No incoming orders yet.
            </p>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <div key={order.id} className="p-5 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-bold text-blue-600 font-mono">
                        {order.order_number || `#EX-${order.id.slice(0, 6)}`}
                      </p>
                      <p className="text-xs font-semibold text-gray-800 mt-0.5">👤 Customer: {order.customer_name || "Customer"}</p>
                      <p className="text-xs text-gray-500">Placed on: {new Date(order.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-md uppercase ${
                      order.status === 'pending_verification' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      order.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'ready' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'
                    }`}>
                      {order.status}
                    </span>
                  </div>

                  {/* Display Student's Uploaded Payment Receipt Screenshot */}
                  {order.transaction_ref && (
                    <div className="bg-white p-3 rounded-lg border border-yellow-200 space-y-2">
                      <p className="text-xs font-semibold text-gray-700">Student Uploaded Payment Receipt:</p>
                      <a 
                        href={`${BACKEND_URL}${order.transaction_ref}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                      >
                        <img 
                          src={`${BACKEND_URL}${order.transaction_ref}`} 
                          alt="Payment Receipt Screenshot" 
                          className="w-32 h-32 object-cover rounded-lg border hover:opacity-90 transition cursor-pointer"
                        />
                      </a>
                      <p className="text-[10px] text-gray-400">Click image to view full size</p>
                    </div>
                  )}

                  {/* Itemized Dish Breakdown */}
                  <div className="border-t border-gray-200 pt-2 space-y-1">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Dishes Ordered:</p>
                    {!order.items || order.items.length === 0 ? (
                      <p className="text-xs text-gray-400">No items found.</p>
                    ) : (
                      order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs text-gray-700 py-0.5">
                          <span className="font-medium">
                            {item.name} <span className="text-gray-500 font-normal">x{item.quantity}</span>
                          </span>
                          <span>RM {Number(item.price_at_order * item.quantity).toFixed(2)}</span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-gray-200 pt-3 flex justify-between items-center font-bold text-gray-900">
                    <div>
                      <span className="text-xs uppercase text-gray-500 font-semibold mr-2">Total Amount</span>
                      <span className="text-orange-600 text-sm">RM {Number(order.total_price).toFixed(2)}</span>
                    </div>
                    <div className="space-x-2">
                      {order.status === 'pending_verification' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                          className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm"
                        >
                          Verify & Accept ✓
                        </button>
                      )}
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'preparing')}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                        >
                          Start Preparing
                        </button>
                      )}
                      {order.status === 'preparing' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(order.id, 'ready')}
                          className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                        >
                          Mark Ready
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}