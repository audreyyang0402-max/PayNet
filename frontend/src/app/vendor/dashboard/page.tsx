// src/app/vendor/dashboard/page.tsx
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { getErrorMessage } from "@/lib/errors";
import MerchantOrdersPanel from "@/components/MerchantOrdersPanel";
import MerchantPaymentSetup from "@/components/MerchantPaymentSetup";
import type { MerchantProfile, Order } from "@/lib/merchant-dashboard-types";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import BackLink from "@/components/BackLink";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";
import DeleteAccountButton from "@/components/DeleteAccountButton";
import ChangePasswordButton from "@/components/ChangePasswordButton";
import RefundManagement from "@/components/RefundManagement";
import FoodPlanning from "@/components/FoodPlanning";
import { signOut } from "@/lib/sign-out";

const MerchantMenuManager = dynamic(
  () => import("@/components/MerchantMenuManager").then((module) => module.MerchantMenuManager),
  { loading: () => <p className="p-4 text-sm text-stone-600">Loading menu tools…</p> },
);
const SurplusOfferManager = dynamic(() => import("@/components/SurplusOfferManager"));
const MerchantPickupSlots = dynamic(() => import("@/components/MerchantPickupSlots"));

type Tab = "analytics" | "planning" | "profile" | "orders" | "refunds" | "menu" | "slots";

const TAB_LABELS: Record<Tab, string> = {
  analytics: "Overview",
  planning: "Food Planning",
  profile: "Store Profile",
  orders: "Manage Orders",
  refunds: "Refunds",
  menu: "Menu",
  slots: "Pickup Slots",
};

// Small pill buttons, not full-width blocks -- on a phone, three stacked
// full-width buttons plus a big avatar/status block pushed everything else
// off screen and forced a lot of scrolling just to reach the tabs below.
const actionButtonClass = "inline-flex items-center justify-center rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-center transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-orange-600";

// A location field that's really just leftover placeholder text (e.g. "-Admin-"
// typed in during setup) looks broken when printed as-is with its stray dashes.
// Strip those and fall back to something sensible instead of an ugly literal "-".
function cleanLocationLabel(raw: string | null | undefined): string {
  const trimmed = (raw || "").trim().replace(/^[-\s]+|[-\s]+$/g, "").trim();
  return trimmed || "No campus location set";
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
  const notificationAudio = useRef<AudioContext | null>(null);
  const [soundReady, setSoundReady] = useState(false);
  const [soundError, setSoundError] = useState("");

  useEffect(() => () => {
    const ctx = notificationAudio.current;
    notificationAudio.current = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => {});
    }
  }, []);

  const enableOrderSounds = async () => {
    setSoundError("");
    try {
      let ctx = notificationAudio.current;
      if (!ctx || ctx.state === "closed") {
        const AudioConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioConstructor) throw new Error("Audio is unavailable in this browser.");
        ctx = new AudioConstructor();
        notificationAudio.current = ctx;
        ctx.onstatechange = () => setSoundReady(notificationAudio.current?.state === "running");
      }
      // Resume directly from the merchant's tap to satisfy mobile autoplay rules.
      await ctx.resume();
      if (notificationAudio.current !== ctx) return;
      setSoundReady(ctx.state === "running");
      playNotificationSound();
    } catch {
      setSoundReady(false);
      setSoundError("Could not enable sound. Tap again and check your device volume.");
    }
  };

  const playNotificationSound = () => {
    try {
      const ctx = notificationAudio.current;
      if (!ctx || ctx.state !== "running") return;
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(587.33, 0, 0.15);
      playTone(880.00, 0.15, 0.3);
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  };

  const merchantId = merchant?.id;
  useEffect(() => {
    if (!merchantId) return;
    let stopped = false, busy = false;
    async function refresh() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const res = await fetch(`${BACKEND_URL}/merchants/${merchantId}/orders`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store" });
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
  }, [merchantId]);

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 5000); return () => clearTimeout(timer); }, [notice]);

  // Menu, Pickup Slots and Surplus Offers are code-split (next/dynamic) so the
  // first dashboard load stays small -- but that means the FIRST time a merchant
  // opens one of those tabs, the browser also has to fetch its JS chunk over the
  // network before it can even start loading data, which is extra-noticeable on
  // slower campus wifi. Quietly warm those chunks in the background once the
  // dashboard itself has settled, so by the time the tab is tapped the code is
  // already cached and only the data fetch is left to wait on.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const schedule = w.requestIdleCallback ? w.requestIdleCallback.bind(w) : (cb: () => void) => window.setTimeout(cb, 300);
    schedule(() => {
      import("@/components/MerchantMenuManager");
      import("@/components/SurplusOfferManager");
      import("@/components/MerchantPickupSlots");
    });
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("analytics");
  const [showDeals, setShowDeals] = useState(false);
  const [editStoreName, setEditStoreName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [profileUpdateSuccess, setProfileUpdateSuccess] = useState("");
  // Bug fix: this never auto-cleared before, so a pause/resume confirmation (now
  // shown right under the status badge, not buried at the bottom of the page)
  // would sit there indefinitely looking stuck/stale long after it stopped being news.
  useEffect(() => { if (!profileUpdateSuccess) return; const timer = setTimeout(() => setProfileUpdateSuccess(""), 6000); return () => clearTimeout(timer); }, [profileUpdateSuccess]);

  const [stallBusy, setStallBusy] = useState(false);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const token = localStorage.getItem("token");
        const role = localStorage.getItem("userRole");
        if (!token || role !== "merchant") {
          router.push("/vendor/login");
          return;
        }
        const profileRes = await fetch(`${BACKEND_URL}/merchants/me/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!profileRes.ok) throw new Error("Could not load merchant profile.");
        const profileData = await profileRes.json();

        const [userRes, ordersRes] = await Promise.all([
          fetch(`${BACKEND_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${BACKEND_URL}/merchants/${profileData.id}/orders`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        setMerchant({ ...profileData, is_temporary: profileData.location?.toLowerCase().includes("boulevard") });
        setEditStoreName(profileData.name || "");
        setEditLocation(profileData.location || "");
        setEditDescription(profileData.description || "");

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
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not load the merchant dashboard."));
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
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Could not update the store profile."));
    }
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
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Could not update the stall status."));
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
        try {
          const parsed = JSON.parse(raw);
          detail = typeof parsed?.detail === "string"
            ? parsed.detail
            : Array.isArray(parsed?.detail)
              ? parsed.detail.map((item: { msg?: string }) => item?.msg).filter(Boolean).join("; ")
              : "";
        } catch { detail = raw; }
        if (detail === "Load failed") {
          detail = "The deployed backend is older than this dashboard. Deploy the latest GitHub commit on Render, then try again.";
        }
        throw new Error(detail || `Backend returned ${res.status}. The order was not changed.`);
      }
      setOrders(current => current.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      if (newStatus === "rejected") {
        setRejectingOrderId(null);
        setRejectionNote("");
        setNotice("Order rejected. If the customer requests a refund, Payvolution admin will review it before it appears in your Refunds tab.");
      }
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : "";
      const isNetworkFailure = err instanceof TypeError || /failed to fetch|load failed|networkerror|network request failed/i.test(rawMessage);
      const message = isNetworkFailure
        ? "The order server could not be reached. Your order was not changed; please wait a moment and try again."
        : rawMessage || "Failed to update order status.";
      setOrderError(message);
    } finally {
      setUpdatingOrderId(null);
      setUpdatingOrderAction(null);
    }
  };

  const handleLogout = () => {
    signOut();
    router.push("/vendor/login");
  };

  const activeOrderCount = orders.filter(o => ["pending", "pending_verification", "preparing", "ready"].includes(o.status)).length;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading dashboard...</div>;
  if (error) return <div className="p-8 text-red-600 bg-red-50 text-center m-8 rounded-xl">{error}</div>;

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

        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          {/* Compact header: on a phone this used to be a huge avatar, a stacked
              name/location/email block, a solid-bright status pill, then three
              full-width stacked buttons -- all before you even reached the tabs.
              Now it's one tight block: small avatar, name + status pill on the
              same line, location/email on one line underneath, and the action
              buttons as a small wrapping row of pills (sized to their text, not
              the full width) right below, so there's far less to scroll past. */}
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-lg font-semibold text-orange-700 ring-1 ring-orange-100">
                {(merchant?.name || "S").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">Merchant Portal</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h1 className="break-words text-lg font-bold leading-tight tracking-tight text-gray-900">{merchant?.name}</h1>
                  {/* Only shown for an admin-closed stall. Live/paused used to be repeated
                      here too, but the toggle button right below already shows that state
                      clearly (and in color), so showing it twice was redundant. */}
                  {merchant?.is_deleted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-stone-500" /> Closed
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-stone-500">📍 {cleanLocationLabel(merchant?.location)}{editEmail ? ` · ${editEmail}` : ""}</p>
              </div>
            </div>

            {soundError ? (
              <p role="status" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-semibold text-red-700">{soundError}</p>
            ) : profileUpdateSuccess ? (
              <p role="status" className="mt-3 rounded-lg bg-green-50 p-2.5 text-xs font-semibold text-green-700">{profileUpdateSuccess}</p>
            ) : null}

            <nav aria-label="Stall actions" className="mt-3 flex flex-wrap gap-2">
              {/* Muted gray, not white-with-a-border -- this is a one-time device
                  setting, not a frequent action, so it shouldn't compete visually
                  with the pause/resume toggle next to it. */}
              <button type="button" onClick={enableOrderSounds} className={`${actionButtonClass} border-stone-200 bg-stone-100 text-stone-500 hover:bg-stone-200`}>
                {soundReady ? "Test sound" : "Enable sounds"}
              </button>

              {merchant?.is_deleted ? (
                <span className={`${actionButtonClass} cursor-default border-stone-200 bg-stone-50 text-stone-400`}>Closed by admin</span>
              ) : (
                <button type="button" disabled={stallBusy} onClick={handleToggleStallActive}
                  className={`${actionButtonClass} disabled:opacity-50 ${merchant?.is_active !== false ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"}`}>
                  {stallBusy ? "Please wait…" : merchant?.is_active !== false ? "Visible to customers, tap to pause" : "Hidden from customers, tap to resume"}
                </button>
              )}

              <button onClick={handleLogout} className={`${actionButtonClass} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}>Log out</button>
            </nav>

            {/* Moved below the buttons -- it's a passive tip, not something that
                should push the actions further down the page. */}
            {!soundError && !profileUpdateSuccess && !soundReady && (
              <p className="mt-3 text-[11px] text-stone-400">Tip: tap “Enable sounds” once on this device for new-order alerts.</p>
            )}
          </div>

          <nav aria-label="Merchant portal" className="grid grid-cols-2 gap-2 border-t border-stone-100 p-3 text-center sm:flex sm:flex-wrap sm:justify-center sm:p-4">
            {(["analytics", "profile", "menu", "orders", "slots", "planning", "refunds"] as Tab[]).map(t => (
              <button
                key={t}
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ${tab === t ? "bg-orange-700 text-white" : "bg-orange-50 text-orange-900 hover:bg-orange-100"}`}
              >
                {t === "orders" ? `${TAB_LABELS[t]} (${activeOrderCount})` : TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </section>

        {tab === "profile" && <div className="space-y-4">
          <form onSubmit={handleUpdateMerchantProfile} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-bold text-stone-900">Store profile</h2>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="submit"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer">
                Save Changes
              </button>
              <ChangePasswordButton />
            </div>

          </form>
          <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-stone-800">Payment QR · {merchant?.duitnow_qr_url ? "Ready" : "Setup needed"}</summary>
            <div className="mt-4"><MerchantPaymentSetup
              qrUrl={merchant?.duitnow_qr_url || ""}
              onQrUploaded={(url) => setMerchant((current) => current ? { ...current, duitnow_qr_url: url } : current)}
            /></div>
          </details>
        </div>}
        {tab === "analytics" && <AnalyticsDashboard audience="merchant" embedded />}
        {tab === "planning" && <FoodPlanning />}
        {tab === "refunds" && <RefundManagement audience="merchant" embedded />}
        {tab === "menu" && <div className="space-y-5">
          <MerchantMenuManager embedded />
          {merchant?.id && <details onToggle={event => setShowDeals(event.currentTarget.open)} className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-sm font-bold text-orange-900">Limited-time deals (optional)</summary>
            <p className="mt-2 text-sm text-stone-600">Offer a lower price for a set number of portions or orders. Your regular menu stays available.</p>
            {showDeals && <div className="mt-4"><SurplusOfferManager merchantId={merchant.id} /></div>}
          </details>}
        </div>}
        {tab === "slots" && merchant?.id && <MerchantPickupSlots merchantId={merchant.id} />}

        {tab === "orders" && (
          <MerchantOrdersPanel
            orders={orders}
            orderFilter={orderFilter}
            setOrderFilter={setOrderFilter}
            orderError={orderError}
            updatingOrderId={updatingOrderId}
            updatingOrderAction={updatingOrderAction}
            rejectingOrderId={rejectingOrderId}
            setRejectingOrderId={setRejectingOrderId}
            rejectionReason={rejectionReason}
            setRejectionReason={setRejectionReason}
            rejectionNote={rejectionNote}
            setRejectionNote={setRejectionNote}
            onUpdateOrderStatus={handleUpdateOrderStatus}
          />
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
