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
import RefundManagement from "@/components/RefundManagement";

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

type Tab = "analytics" | "profile" | "orders" | "refunds" | "menu" | "slots" | "payment";

const TAB_LABELS: Record<Tab, string> = {
  analytics: "Overview",
  profile: "Store Profile",
  orders: "Manage Orders",
  refunds: "Refunds",
  menu: "Menu",
  slots: "Pickup Slots",
  payment: "Payment Setup",
};

// Single place that decides how each order status reads and is colored in
// the Manage Orders card — keeps the badge, the left accent stripe and the
// label in sync instead of three separate ad-hoc checks.
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

export default function MerchantDashboard() {
  const router = useRouter();
  const [merchant, setMerchant] = useState<MerchantProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderFilter, setOrderFilter] = useState("active");
  const [notice, setNotice] = useState("");
  const [orderError, setOrderError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [updatingOrderAction, setUpdatingOrderAction] = useState<string | null>(null);
  const [rejectingOrderId, setRejectingOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("item_sold_out");
  const [rejectionNote, setRejectionNote] = useState("");
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

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string, rejection?: { reason: string; note: string }) => {
    if (updatingOrderId) return;
    setUpdatingOrderId(orderId);
    setUpdatingOrderAction(newStatus);
    setOrderError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${BACKEND_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus, rejection_reason: rejection?.reason, rejection_note: rejection?.note }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let detail = "";
        try { detail = JSON.parse(raw)?.detail || ""; } catch { detail = raw; }
        if (detail === "Load failed") {
          detail = "The deployed backend is older than this dashboard. Deploy the latest GitHub commit on Render, then try again.";
        }
        throw new Error(detail || `Backend returned ${res.status}. The order was not changed.`);
      }
      setOrders(current => current.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      if (newStatus === "rejected") { setRejectingOrderId(null); setRejectionNote(""); setTab("refunds"); }
    } catch (err: unknown) {
      const message = err instanceof TypeError && err.message === "Failed to fetch"
        ? "The order server could not be reached. Your order was not changed; please wait a moment and try again."
        : err instanceof Error ? err.message : "Failed to update order status.";
      setOrderError(message);
    } finally {
      setUpdatingOrderId(null);
      setUpdatingOrderAction(null);
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
            {(["analytics", "profile", "orders", "refunds", "menu", "slots", "payment"] as Tab[]).map(t => (
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
        {tab === "refunds" && <RefundManagement audience="merchant" embedded />}
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
                  <div key={order.id} className={`rounded-2xl border border-gray-200 border-l-4 ${statusMeta(order.status).accent} bg-white p-5 shadow-sm transition hover:shadow-md`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                      <div>
                        <p className="font-mono text-sm font-bold text-gray-900">{order.order_number || `#EX-${order.id.slice(0, 6)}`}</p>
                        <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                          <dt className="text-gray-400">Customer</dt>
                          <dd className="font-semibold text-gray-800">{order.customer_name || "Customer"}</dd>
                          <dt className="text-gray-400">Placed on</dt>
                          <dd className="text-gray-600">{new Date(order.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" })}</dd>
                          {order.pickup_time && (
                            <>
                              <dt className="text-gray-400">Pickup slot</dt>
                              <dd className="font-semibold text-orange-700">{new Date(order.pickup_time).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</dd>
                            </>
                          )}
                        </dl>
                      </div>
                      <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusMeta(order.status).badge}`}>{statusMeta(order.status).label}</span>
                    </div>
                    {order.transaction_ref && (
                      <a href={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`} target="_blank" rel="noopener noreferrer"
                        className="mt-4 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 transition hover:bg-stone-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={order.transaction_ref.startsWith("http") ? order.transaction_ref : `${BACKEND_URL}${order.transaction_ref}`}
                          alt="Payment receipt screenshot" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-stone-200 object-cover" />
                        <div className="text-xs">
                          <p className="font-semibold text-stone-700">Payment receipt uploaded</p>
                          <p className="text-stone-400">Tap to view full size</p>
                        </div>
                      </a>
                    )}
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Items</p>
                      {!order.items || order.items.length === 0 ? (
                        <p className="text-xs text-gray-400">No items found.</p>
                      ) : (
                        <ul className="space-y-2">
                          {order.items.map((item, idx) => (
                            <li key={idx} className="flex items-start justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <span className="font-medium text-gray-800">{item.name}</span>
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
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total</p>
                        <p className="text-base font-bold text-gray-900">RM {Number(order.total_price).toFixed(2)}</p>
                      </div>
                      <div className="flex gap-2">
                        {(order.status === "pending_verification" || order.status === "pending") && (
                          <button onClick={() => { setRejectingOrderId(order.id); setRejectionReason("item_sold_out"); setRejectionNote(""); }}
                            disabled={updatingOrderId === order.id}
                            className="rounded-lg border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id && updatingOrderAction === "rejected" ? "Updating…" : "Reject"}
                          </button>
                        )}
                        {order.status === "pending_verification" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "preparing")}
                            disabled={updatingOrderId === order.id}
                            className="bg-green-600 hover:bg-green-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-sm disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id && updatingOrderAction === "preparing" ? "Updating…" : "Verify & Accept"}
                          </button>
                        )}
                        {order.status === "pending" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "preparing")}
                            disabled={updatingOrderId === order.id}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id && updatingOrderAction === "preparing" ? "Updating…" : "Start Preparing"}
                          </button>
                        )}
                        {order.status === "ready" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                            disabled={updatingOrderId === order.id}
                            className="rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                            {updatingOrderId === order.id && updatingOrderAction === "completed" ? "Updating…" : "Mark Collected"}
                          </button>
                        )}
                        {order.status === "preparing" && (
                          <button onClick={() => handleUpdateOrderStatus(order.id, "ready")}
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
                        <div className="flex gap-2">
                          <button type="button" disabled={updatingOrderId === order.id}
                            onClick={() => handleUpdateOrderStatus(order.id, "rejected", { reason: rejectionReason, note: rejectionNote })}
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
