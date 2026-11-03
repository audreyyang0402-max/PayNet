// src/app/vendor/dashboard/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import { MerchantMenuManager } from "@/components/MerchantMenuManager";
import MerchantPickupSlots from "@/components/MerchantPickupSlots";
import ChangePasswordButton from "@/components/ChangePasswordButton";

interface MerchantProfile {
  id: string;
  name: string;
  location: string;
  description: string;
  duitnow_qr_url?: string;
  is_temporary?: boolean;
  is_active?: boolean;
  is_deleted?: boolean;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price_at_order: number;
  special_instructions?: string | null;
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
  pickup_time?: string | null;
  items?: OrderItem[];
}

interface PickupSlot {
  id: string;
  time_slot: string;
  max_capacity: number;
  current_bookings: number;
}

type Tab = "analytics" | "profile" | "orders" | "menu" | "slots" | "payment";

const TAB_LABELS: Record<Tab, string> = {
  analytics: "Overview",
  profile: "Store Profile",
  orders: "Manage Orders",
  menu: "Menu",
  slots: "Pickup Slots",
  payment: "Payment Setup",
};

export default function MerchantDashboard() {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("active");
  const [notice, setNotice] = useState("");
  const [orderError, setOrderError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const seenOrders = useRef<Set<string> | null>(null);

  // Slot summary for tab label badge — loaded at startup AND updated live
  const [slotBookings, setSlotBookings] = useState(0);
  const [slotCapacity, setSlotCapacity] = useState(0);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(587.33, 0, 0.15);
      playTone(880.00, 0.15, 0.3);
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  useEffect(() => {
    if (!merchant?.id) return;
    let stopped = false, busy = false;
    async function refresh() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const res = await fetch(`${BACKEND_URL}/merchants/${merchant!.id}/orders`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store" });
        if (!res.ok) throw Error("Could not refresh orders. Please reload or sign in again.");
        const rows: Order[] = await res.json();
        if (stopped) return;
        if (seenOrders.current && rows.some(o => !seenOrders.current!.has(o.id))) {
          setNotice("New order received. Open Manage Orders to review it.");
          playNotificationSound();
        }
        seenOrders.current = new Set(rows.map(o => o.id)); setOrders(rows); setOrderError("");
      } catch (e) { if (!stopped) setOrderError(e instanceof Error ? e.message : "Could not refresh orders."); }
      finally { busy = false; }
    }
    refresh(); const timer = setInterval(refresh, 15000);
    return () => { stopped = true; clearInterval(timer); };
  }, [merchant?.id]);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("analytics");
  const [editStoreName, setEditStoreName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileUpdateSuccess, setProfileUpdateSuccess] = useState("");

  const [qrUrl, setQrUrl] = useState("");
  const [qrUpdating, setQrUpdating] = useState(false);
  const [qrUpdateMessage, setQrUpdateMessage] = useState("");

  const [stallBusy, setStallBusy] = useState(false);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");
        if (!token || role !== "merchant") {
          router.push("/vendor/login" as any);
          return;
        }
        const profileRes = await fetch(`${BACKEND_URL}/merchants/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!profileRes.ok) throw new Error("Could not load merchant profile.");
        const profileData = await profileRes.json();

        // Fetch user, orders AND slots together so the tab badge shows immediately
        const [userRes, ordersRes, slotsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND_URL}/merchants/${profileData.id}/orders`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND_URL}/merchants/${profileData.id}/pickup-slots`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        setMerchant({ ...profileData, is_temporary: profileData.location?.toLowerCase().includes("boulevard") });
        setEditStoreName(profileData.name || "");
        setEditLocation(profileData.location || "");
        setEditDescription(profileData.description || "");
        setQrUrl(profileData.duitnow_qr_url || "");

        if (userRes.ok) {
          const userData = await userRes.json();
          setEditEmail(userData.email || "");
          setEditPhone(userData.phone_number || "");
        }
        if (ordersRes.ok) {
          const ordersData = await ordersRes.json();
          setOrders(ordersData);
          seenOrders.current = new Set(ordersData.map((o: Order) => o.id));
        }
        if (slotsRes.ok) {
          const slotsData: PickupSlot[] = await slotsRes.json();
          const totalBookings = slotsData.reduce((s, sl) => s + sl.current_bookings, 0);
          const totalCapacity = slotsData.reduce((s, sl) => s + sl.max_capacity, 0);
          setSlotBookings(totalBookings);
          setSlotCapacity(totalCapacity);
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
      const res = await fetch(`${BACKEND_URL}/merchants/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone_number: editPhone, description: editDescription }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update merchant profile.");
      }
      const updated = await res.json();
      setMerchant((prev) => prev ? { ...prev, name: updated.store_name, location: updated.location, description: updated.description } : null);
      setProfileUpdateSuccess("Store profile updated successfully!");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUploadQR = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = document.getElementById("merchant-qr-file") as HTMLInputElement;
    if (!fileInput?.files?.[0]) { alert("Please select a QR code image file."); return; }
    setQrUpdating(true); setQrUpdateMessage("");
    try {
      const token = localStorage.getItem("token");
      const formData = new FormData();
      formData.append("qr_file", fileInput.files[0]);
      const res = await fetch(`${BACKEND_URL}/merchants/me/qr-upload`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setQrUpdateMessage("DuitNow QR uploaded successfully!");
        setMerchant((prev) => prev ? { ...prev, duitnow_qr_url: data.duitnow_qr_url } : null);
        setQrUrl(data.duitnow_qr_url);
      } else { alert("Failed to upload QR code."); }
    } catch (err) { console.error(err); }
    finally { setQrUpdating(false); }
  };

  const handleToggleStallActive = async () => {
    if (!merchant) return;
    const turningOff = merchant.is_active !== false;
    if (turningOff && !window.confirm("Pause your stall? Customers won't be able to see or order from you until you turn it back on.")) return;
    setStallBusy(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/merchants/me/toggle-active`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not update your stall status.");
      setMerchant(prev => prev ? { ...prev, is_active: data.is_active } : prev);
      setProfileUpdateSuccess(data.message);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setStallBusy(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(orderId);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to update order status.");
      }
      setOrders(current => current.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
    } catch (err: unknown) {
      const message = err instanceof TypeError && err.message === "Failed to fetch"
        ? "The order server could not be reached. Your order was not changed; please wait a moment and try again."
        : err instanceof Error ? err.message : "Failed to update order status.";
      alert(message);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/vendor/login" as any);
  };

  const activeOrderCount = orders.filter(o => ["pending", "pending_verification", "preparing", "ready"].includes(o.status)).length;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl">{error}</div>;

  const ORDER_FILTERS: { key: string; label: string }[] = [
    { key: "active", label: "Incoming / Active" },
    { key: "pending_verification", label: "Pending Verification" },
    { key: "preparing", label: "Preparing" },
    { key: "ready", label: "Ready" },
    { key: "completed", label: "Completed" },
    { key: "all", label: "All" },
  ];

  return (
    <main className="min-h-screen bg-stone-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {notice && (
          <div role="status" className="fixed right-4 top-4 z-50 max-w-sm rounded-xl border border-orange-200 bg-white p-4 shadow-xl">
            {notice}
            <button onClick={() => { setTab("orders"); setNotice(""); }} className="ml-2 font-semibold text-orange-700">View orders</button>
          </div>
        )}

        <BackLink href="/">Back to marketplace</BackLink>

        {/* Header */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="bg-orange-50 text-orange-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">
                Merchant Portal
              </span>
              <h1 className="text-2xl font-bold text-gray-900">{merchant?.name}</h1>
              <p className="text-gray-500 text-sm">📍 {merchant?.location}</p>
            </div>
            <button onClick={handleLogout} className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">Log Out</button>
          </div>

          {/* Nav tabs */}
          <nav aria-label="Merchant portal" className="grid grid-cols-2 gap-2 border-t border-stone-100 pt-4 text-center sm:flex sm:flex-wrap sm:justify-center">
            {(["analytics", "profile", "orders", "menu", "slots", "payment"] as Tab[]).map(t => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${tab === t ? "bg-orange-700 text-white" : "bg-orange-50 text-orange-900 hover:bg-orange-100"}`}
              >
                {t === "orders"
                  ? `${TAB_LABELS[t]} (${activeOrderCount})`
                  : t === "slots" && slotCapacity > 0
                  ? `${TAB_LABELS[t]} (${slotBookings}/${slotCapacity})`
                  : TAB_LABELS[t]}
              </button>
            ))}
          </nav>

          {profileUpdateSuccess && (
            <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl">{profileUpdateSuccess}</div>
          )}

          {/* Store Profile tab */}
          {tab === "profile" && (
            <form onSubmit={handleUpdateMerchantProfile} className="space-y-4 pt-4 border-t border-gray-100">
              <p className="text-sm text-stone-500">Your registered stall name, campus location and email are fixed. You can edit your bio, operating hours and contact phone below.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Store / Stall Name</label>
                  <input type="text" required value={editStoreName} readOnly aria-readonly="true"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Campus Location</label>
                  <input type="text" required value={editLocation} readOnly aria-readonly="true"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Store Bio & Opening Hours</label>
                <textarea rows={2} value={editDescription} onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="Operating Hours: Mon-Fri 8 AM - 5 PM" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Email Address</label>
                  <input type="email" required value={editEmail} readOnly
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Phone Number</label>
                  <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="+60123456789" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <button type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer">
                  Save Changes
                </button>
                <ChangePasswordButton />
              </div>

              {merchant?.is_deleted ? (
                <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs font-semibold text-stone-500">
                  🔒 This stall has been closed by an admin. Contact support if you believe this is a mistake.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-stone-800">
                      {merchant?.is_active !== false ? "Your stall is live" : "Your stall is paused"}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {merchant?.is_active !== false ? "Customers can see and order from you." : "Hidden from customers until you turn it back on."}
                    </p>
                  </div>
                  <button type="button" disabled={stallBusy} onClick={handleToggleStallActive}
                    className={`rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${merchant?.is_active !== false ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                    {stallBusy ? "Please wait…" : merchant?.is_active !== false ? "Pause my stall" : "Resume my stall"}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {tab === "analytics" && <AnalyticsDashboard audience="merchant" embedded />}
        {tab === "menu" && <MerchantMenuManager embedded />}
        {tab === "slots" && merchant?.id && (
          <MerchantPickupSlots
            merchantId={merchant.id}
            onSlotsChange={(booked, capacity) => {
              setSlotBookings(booked);
              setSlotCapacity(capacity);
            }}
          />
        )}

        {tab === "payment" && (
          <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-6 rounded-2xl shadow-sm border border-indigo-200">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-indigo-600">Payment Setup</p>
            <h2 className="text-lg font-bold text-indigo-950 mb-1">DuitNow QR Management</h2>
            <p className="text-xs text-gray-500 mb-4">Upload your static DuitNow QR image file so customers can scan it during checkout.</p>
            <form onSubmit={handleUploadQR} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Upload QR Image File</label>
                <input id="merchant-qr-file" type="file" accept="image/*" required
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100" />
              </div>
              {qrUrl && (
                <div className="text-center py-3 bg-gray-50 rounded-xl border border-gray-100 max-w-xs">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Current QR Code:</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrUrl.startsWith("http") ? qrUrl : `${BACKEND_URL}${qrUrl}`} alt="DuitNow QR Preview"
                    className="w-36 h-36 mx-auto object-contain bg-white rounded-lg border p-1" />
                </div>
              )}
              {qrUpdateMessage && <p className="text-xs font-semibold text-green-600">{qrUpdateMessage}</p>}
              <button type="submit" disabled={qrUpdating}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-sm">
                {qrUpdating ? "Uploading..." : "Upload QR Code"}
              </button>
            </form>
          </div>
        )}

        {tab === "orders" && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 space-y-4">
            <h2 className="scroll-mt-6 text-xl font-bold text-gray-900">Manage Orders</h2>
            <p className="text-sm text-stone-500">Updates every 15 seconds while this page is visible. Verify payment in your banking app before accepting.</p>
            {orderError && <p role="alert" className="text-sm text-red-700">{orderError}</p>}
            <nav aria-label="Order status" className="flex flex-wrap gap-2">
              {ORDER_FILTERS.map(f => (
                <button key={f.key} onClick={() => setOrderFilter(f.key)} aria-pressed={orderFilter === f.key}
                  className={`rounded-full px-3 py-2 text-xs font-semibold ${orderFilter === f.key ? "bg-orange-600 text-white" : "bg-stone-100 text-stone-700"}`}>
                  {f.label}
                </button>
              ))}
            </nav>
            {!orders.some(o => orderFilter === "all" || (orderFilter === "active" ? ["pending", "pending_verification", "preparing", "ready"].includes(o.status) : o.status === orderFilter)) && (
              <p className="p-4 text-sm text-stone-500">No orders in this category.</p>
            )}
            {orders.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">No incoming orders yet.</p>
            ) : (
              <div className="space-y-4">
                {orders.filter(o => orderFilter === "all" || (orderFilter === "active" ? ["pending", "pending_verification", "preparing", "ready"].includes(o.status) : o.status === orderFilter)).map((order) => (
                  <div key={order.id} className="p-5 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-xs font-bold text-blue-600 font-mono">{order.order_number || `#EX-${order.id.slice(0, 6)}`}</p>
                        <p className="text-xs font-semibold text-gray-800 mt-0.5">👤 Customer: {order.customer_name || "Customer"}</p>
                        <p className="text-xs text-gray-500">Placed on: {new Date(order.created_at).toLocaleString()}</p>
                        {order.pickup_time && (
                          <p className="text-xs font-semibold text-orange-700 mt-0.5">🕐 Pickup slot: {new Date(order.pickup_time).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-md uppercase ${
                        order.status === "pending_verification" ? "bg-yellow-100 text-yellow-800" :
                        order.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                        order.status === "preparing" ? "bg-blue-100 text-blue-800" :
                        order.status === "ready" ? "bg-green-100 text-green-800" :
                        order.status === "rejected" || order.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-gray-200 text-gray-800"
                      }`}>{order.status}</span>
                    </div>
                    {order.transaction_ref && (
                      <div className="bg-white p-3 rounded-lg border border-yellow-200 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Student Uploaded Payment Receipt:</p>
                        <a href={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`}
                            alt="Payment Receipt Screenshot" loading="lazy" className="w-32 h-32 object-cover rounded-lg border hover:opacity-90 transition cursor-pointer" />
                        </a>
                        <p className="text-[10px] text-gray-400">Click image to view full size</p>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-2 space-y-1">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Dishes Ordered:</p>
                      {!order.items || order.items.length === 0 ? (
                        <p className="text-xs text-gray-400">No items found.</p>
                      ) : (
                        order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-3 text-xs text-gray-700 py-0.5">
                            <div className="min-w-0">
                              <span className="font-medium">{item.name} <span className="text-gray-500 font-normal">x{item.quantity}</span></span>
                              {item.special_instructions && (
                                <p className="mt-1 rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold leading-relaxed text-orange-800">
                                  Customer request: {item.special_instructions}
                                </p>
                              )}
                            </div>
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
                        {(order.status === "pending_verification" || order.status === "pending") && (
                          <button onClick={() => { if (confirm("Reject this order? Use this when the payment receipt is missing or not genuine. The pickup place is freed.")) handleUpdateOrderStatus(order.id, "rejected"); }}
                            disabled={updatingOrderId === order.id}
                            className="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id ? "Updating…" : "Reject"}
                          </button>
                        )}
                        {order.status === "pending_verification" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "preparing")}
                            disabled={updatingOrderId === order.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id ? "Updating…" : "Verify & Accept ✓"}
                          </button>
                        )}
                        {order.status === "pending" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "preparing")}
                            disabled={updatingOrderId === order.id}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id ? "Updating…" : "Start Preparing"}
                          </button>
                        )}
                        {order.status === "ready" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                            disabled={updatingOrderId === order.id}
                            className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id ? "Updating…" : "Mark Collected"}
                          </button>
                        )}
                        {order.status === "preparing" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "ready")}
                            disabled={updatingOrderId === order.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id ? "Updating…" : "Mark Ready"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "profile" && (
          <details className="rounded-2xl border border-stone-200 bg-white p-5">
            <summary className="cursor-pointer list-none text-sm font-semibold text-stone-600">Account Management</summary>
            <div className="mt-4"><DeleteAccountButton /></div>
          </details>
        )}

      </div>
    </main>
  );
}
