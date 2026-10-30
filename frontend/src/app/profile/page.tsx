// src/app/profile/page.tsx
// Enhanced Profile Page with profile picture, preferred name, dietary preferences,
// non-editable locked fields, collapsible order history, and mobile-first design.
"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DeleteAccountButton from "@/components/DeleteAccountButton";

// ─── Type Definitions ────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  phone_number?: string;
}

interface OrderItem {
  id: string;
  name: string; // dish name from the backend
  quantity: number;
  price_at_order: number;
  menu_item_id?: string;
}

interface OrderWithItems {
  id: string;
  status: string;
  total_price: number;
  created_at: string;
  items: OrderItem[];
}

// ─── All dietary tag options ─────────────────────────────────────────────────

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Halal",
  "No Peanuts",
  "No Dairy",
  "No Seafood",
  "No Eggs",
] as const;

// ─── Notification Sound (programmatic, no external file) ─────────────────────

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5 note

    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.error("Audio playback blocked or not supported", e);
  }
}

// ─── Main Profile Page Component ─────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();

  // ── Core data state ──
  const [user, setUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Edit mode state ──
  const [isEditing, setIsEditing] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState("");

  // ── Profile picture (stored in localStorage as base64 DataURL) ──
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Preferred / display name (localStorage only) ──
  const [preferredName, setPreferredName] = useState("");
  const [editPreferredName, setEditPreferredName] = useState("");

  // ── Dietary preferences (localStorage, JSON array) ──
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([]);

  // ── Collapsible order details — track which orders are expanded ──
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

  // ── Permanently dismissed ready-order notification IDs ──
  const [dismissedOrderIds, setDismissedOrderIds] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("permanentlyDismissedOrders");
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  // ── Load localStorage values on mount (profile pic, preferred name, dietary) ──
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPic = localStorage.getItem("profilePicture");
      if (savedPic) setProfilePicture(savedPic);

      const savedName = localStorage.getItem("preferredName");
      if (savedName) {
        setPreferredName(savedName);
        setEditPreferredName(savedName);
      }

      const savedDiet = localStorage.getItem("dietaryPreferences");
      if (savedDiet) {
        try {
          setDietaryPreferences(JSON.parse(savedDiet));
        } catch {
          // ignore corrupted data
        }
      }
    }
  }, []);

  // ── Fetch profile & orders from backend, poll every 10s ──
  useEffect(() => {
    async function loadProfileData() {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          router.push("/vendor/login" as any);
          return;
        }

        // 1. Fetch current user info
        const userRes = await fetch(`${BACKEND_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!userRes.ok) throw new Error("Failed to load user profile.");
        const userData = await userRes.json();
        setUser(userData);

        // 2. Fetch customer orders and line items (if they are a customer)
        if (userData.role === "customer") {
          const ordersRes = await fetch(`${BACKEND_URL}/users/me/orders`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (ordersRes.ok) {
            const baseOrders = await ordersRes.json();

            // Fetch detailed line items for each order to build the receipt
            const detailedOrders = await Promise.all(
              baseOrders.map(async (order: any) => {
                try {
                  const detailRes = await fetch(`${BACKEND_URL}/orders/${order.id}`);
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

            // Check if any order newly transitioned to 'ready' to play notification
            setOrders((prevOrders) => {
              detailedOrders.forEach((newOrder: OrderWithItems) => {
                const oldOrder = prevOrders.find((o) => o.id === newOrder.id);
                if (
                  newOrder.status.toLowerCase() === "ready" &&
                  (!oldOrder || oldOrder.status.toLowerCase() !== "ready")
                ) {
                  playNotificationSound();
                }
              });
              return detailedOrders;
            });
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();

    // Poll every 10 seconds to auto-detect when merchant updates order status
    const interval = setInterval(loadProfileData, 10000);
    return () => clearInterval(interval);
  }, [router]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  /** Handle profile picture upload via hidden file input */
  const handlePictureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setProfilePicture(dataUrl);
      localStorage.setItem("profilePicture", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  /** Save editable fields (preferred name to localStorage, password to backend) */
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateSuccess("");
    setError(null);

    try {
      // Save preferred name to localStorage (client-only)
      localStorage.setItem("preferredName", editPreferredName);
      setPreferredName(editPreferredName);

      setUpdateSuccess("Profile updated successfully!");
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  /** Toggle a dietary preference tag on/off and persist to localStorage */
  const toggleDietaryPreference = (pref: string) => {
    setDietaryPreferences((prev) => {
      const updated = prev.includes(pref)
        ? prev.filter((p) => p !== pref)
        : [...prev, pref];
      localStorage.setItem("dietaryPreferences", JSON.stringify(updated));
      return updated;
    });
  };

  /** Toggle collapsible order detail view */
  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  /** Logout — clear tokens and redirect */
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/vendor/login" as any);
  };

  // ── Computed: ready orders that haven't been dismissed ──
  const readyOrders = orders.filter(
    (o) => o.status.toLowerCase() === "ready" && !dismissedOrderIds.includes(o.id)
  );

  // ── Derive user initials for the default avatar ──
  const userInitial = user?.name?.charAt(0)?.toUpperCase() || "?";

  // ─── Loading & Error States ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffcef] flex items-center justify-center">
        {/* Simple spinner with brand color */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-orange-200 border-t-[#F04B14] rounded-full animate-spin" />
          <p className="text-gray-500 text-sm font-medium">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-[#fffcef] flex items-center justify-center p-4">
        <div className="p-6 bg-red-50 text-red-700 text-center rounded-2xl border border-red-200 max-w-md w-full">
          <p className="font-semibold mb-1">Something went wrong</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Main Render ───────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#fffcef] p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 1 — Navigation & Logout Header
            Mobile: stacked vertically | Desktop: horizontal row
        ────────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          {/* Back link */}
          <Link
            href="/"
            className="text-orange-600 hover:underline font-medium text-sm"
          >
            ← Back to Marketplace
          </Link>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {/* Vendor dashboard link (merchants only) */}
            {user?.role === "merchant" && (
              <Link
                href="/vendor/dashboard"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-all"
              >
                Go to Vendor Dashboard
              </Link>
            )}

            {/* Customer analytics link (customers only) */}
            {user?.role === "customer" && (
              <Link
                href="/customer/analytics"
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-xl transition-all"
              >
                View My Analytics
              </Link>
            )}

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white border border-gray-200 hover:border-red-300 text-gray-600 hover:text-red-600 text-sm font-medium rounded-xl transition-colors cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 2 — Profile Card (avatar, info, edit, & Danger Zone)
        ────────────────────────────────────────────────────────────────── */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">

          {/* Top row: Avatar + Info + Edit toggle */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-5">

            {/* ── Profile Picture / Avatar ── */}
            <div className="relative flex-shrink-0">
              {/* Hidden file input for picture upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={handlePictureUpload}
              />

              {/* Circular avatar — shows uploaded pic or initials fallback */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-orange-100 hover:border-orange-300 transition-colors cursor-pointer relative group"
                title="Click to upload profile picture"
              >
                {profilePicture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profilePicture}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  /* Default avatar with user initial */
                  <div className="w-full h-full bg-gradient-to-br from-orange-400 to-[#F04B14] flex items-center justify-center">
                    <span className="text-white text-3xl sm:text-4xl font-bold select-none">
                      {userInitial}
                    </span>
                  </div>
                )}

                {/* Camera icon overlay — always visible on hover */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-7 h-7 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 7h2l2-3h10l2 3h2a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"
                    />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
              </button>

              {/* Small camera badge in bottom-right corner */}
              <span className="absolute bottom-0 right-0 bg-[#F04B14] text-white rounded-full w-7 h-7 flex items-center justify-center shadow-md pointer-events-none">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 7h2l2-3h10l2 3h2a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z"
                  />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
            </div>

            {/* ── User Info Block ── */}
            <div className="flex-1 text-center sm:text-left min-w-0">
              {/* Role badge */}
              <span
                className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block ${
                  user?.role === "merchant"
                    ? "bg-purple-50 text-purple-600"
                    : "bg-orange-50 text-orange-600"
                }`}
              >
                {user?.role === "merchant" ? "Merchant Account" : "Customer Account"}
              </span>

              {/* Preferred name (prominent) + full name (smaller) */}
              {preferredName ? (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 truncate">
                    {preferredName}
                  </h1>
                  <p className="text-sm text-gray-400 mt-0.5">{user?.name}</p>
                </>
              ) : (
                <h1 className="text-2xl font-bold text-gray-900 truncate">
                  {user?.name}
                </h1>
              )}

              {/* Locked fields with lock icons */}
              <div className="mt-3 space-y-1.5">
                <p className="text-gray-500 text-sm flex items-center justify-center sm:justify-start gap-1.5">
                  <span className="text-xs">🔒</span>
                  <span>📧 {user?.email}</span>
                </p>
                {user?.phone_number && (
                  <p className="text-gray-500 text-sm flex items-center justify-center sm:justify-start gap-1.5">
                    <span className="text-xs">🔒</span>
                    <span>📞 {user.phone_number}</span>
                  </p>
                )}
                <p className="text-gray-500 text-sm flex items-center justify-center sm:justify-start gap-1.5">
                  <span className="text-xs">🔒</span>
                  <span>👤 {user?.name}</span>
                </p>
              </div>

              {/* Locked field hint */}
              <p className="text-[11px] text-gray-400 mt-2 italic">
                Contact admin to change locked fields
              </p>
            </div>

            {/* ── Right side: total orders stat + edit button ── */}
            <div className="flex flex-col items-center sm:items-end gap-2 flex-shrink-0">
              {/* Total orders badge (customers only) */}
              {user?.role === "customer" && (
                <div className="text-center bg-gray-50 px-4 py-3 rounded-xl border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase font-semibold">
                    Total Orders
                  </p>
                  <p className="text-xl font-bold text-gray-900">{orders.length}</p>
                </div>
              )}

              {/* Edit / Cancel toggle */}
              <button
                onClick={() => {
                  setIsEditing(!isEditing);
                  if (!isEditing) {
                    setEditPreferredName(preferredName);
                                }
                }}
                className="px-3.5 py-2 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
              >
                {isEditing ? "Cancel" : "Edit Profile"}
              </button>
            </div>
          </div>

          {/* ── Success banner ── */}
          {updateSuccess && (
            <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl border border-green-200">
              ✅ {updateSuccess}
            </div>
          )}

          {/* ── Inline error banner ── */}
          {error && user && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              ⚠️ {error}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────
              Edit Form — Preferred Name & Password (editable fields only)
          ────────────────────────────────────────────────────────────── */}
          {isEditing && (
            <form
              onSubmit={handleUpdateProfile}
              className="space-y-4 pt-4 border-t border-gray-100"
            >
              {/* Preferred / Display Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Preferred / Display Name
                </label>
                <input
                  type="text"
                  value={editPreferredName}
                  onChange={(e) => setEditPreferredName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 outline-none"
                  placeholder="What should we call you?"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  This is stored locally and only visible to you.
                </p>
              </div>

              <a href="/forgot-password" className="text-orange-700 underline">
                Change password with an email verification code
              </a>

              {/* Submit */}
              <button
                type="submit"
                className="px-5 py-2 bg-[#F04B14] hover:bg-orange-700 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Save Changes
              </button>
            </form>
          )}

          {/* ── Danger Zone (Moved inside top profile card) ── */}
          {user?.role !== "admin" && (
            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-red-600">⚠️ Danger Zone</h3>
                <p className="text-xs text-gray-500">Permanently delete your account and remove access.</p>
              </div>
              <div className="w-full sm:w-auto">
                <DeleteAccountButton />
              </div>
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 3 — Dietary Preferences (tag toggle pills)
        ────────────────────────────────────────────────────────────────── */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">🥗 Dietary Preferences</h2>
          <p className="text-xs text-gray-500">
            Select any dietary preferences. These are saved locally for your reference.
          </p>

          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((option) => {
              const isActive = dietaryPreferences.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => toggleDietaryPreference(option)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                    isActive
                      ? "bg-[#F04B14] text-white border-[#F04B14] shadow-sm"
                      : "bg-gray-100 text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-600"
                  }`}
                >
                  {isActive ? "✓ " : ""}
                  {option}
                </button>
              );
            })}
          </div>

          {dietaryPreferences.length > 0 && (
            <p className="text-xs text-gray-400 pt-1">
              Active: {dietaryPreferences.join(", ")}
            </p>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 4 — Ready Order Notification Banners
        ────────────────────────────────────────────────────────────────── */}
        {readyOrders.map((order) => (
          <div
            key={order.id}
            className="bg-green-50 border border-green-200 p-4 rounded-2xl shadow-sm flex items-center justify-between animate-pulse"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <span className="text-2xl flex-shrink-0">🔔</span>
              <div className="min-w-0">
                <h3 className="font-bold text-green-800 text-sm truncate">
                  Action Required: Order #{order.id.slice(0, 8)} is Ready!
                </h3>
                <p className="text-xs text-green-700">
                  Your food for this receipt is ready. Head over to the stall to
                  pick it up!
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const updated = [...dismissedOrderIds, order.id];
                setDismissedOrderIds(updated);
                localStorage.setItem(
                  "permanentlyDismissedOrders",
                  JSON.stringify(updated)
                );
              }}
              className="text-green-700 hover:text-green-900 font-bold text-sm px-2 py-1 cursor-pointer transition-colors flex-shrink-0"
              title="Dismiss notification permanently"
            >
              ✕
            </button>
          </div>
        ))}

        {/* ──────────────────────────────────────────────────────────────────
            SECTION 5 — Order History & Receipts (customers only)
        ────────────────────────────────────────────────────────────────── */}
        {user?.role === "customer" && (
          <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">
              📋 Order History & Receipts
            </h2>

            {orders.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl space-y-3">
                <p className="text-gray-500 text-sm">
                  You haven&apos;t placed any orders yet.
                </p>
                <Link
                  href="/"
                  className="inline-block px-4 py-2 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 transition-all"
                >
                  Browse Merchants
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => {
                  const isExpanded = expandedOrders.has(order.id);

                  return (
                    <div
                      key={order.id}
                      className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleOrderExpanded(order.id)}
                        className="w-full px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>

                          <div className="text-left min-w-0">
                            <p className="text-xs text-gray-400 font-mono truncate">
                              #{order.id.slice(0, 8)}…
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(order.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-bold text-[#F04B14]">
                            RM {Number(order.total_price).toFixed(2)}
                          </span>

                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase ${
                              order.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : order.status === "preparing"
                                ? "bg-blue-100 text-blue-800"
                                : order.status === "ready"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-200 text-gray-800"
                            }`}
                          >
                            {order.status}
                          </span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-gray-200 space-y-2">
                          <p className="text-[11px] text-gray-400 font-mono">
                            Order ID: {order.id}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Placed on:{" "}
                            {new Date(order.created_at).toLocaleString()}
                          </p>

                          <div className="pt-2 space-y-1">
                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                              Receipt Items:
                            </p>
                            {!order.items || order.items.length === 0 ? (
                              <p className="text-xs text-gray-400">
                                No items found.
                              </p>
                            ) : (
                              order.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="flex justify-between text-xs text-gray-700 py-0.5"
                                >
                                  <span className="font-medium">
                                    {item.name}{" "}
                                    <span className="text-gray-500 font-normal">
                                      x{item.quantity}
                                    </span>
                                  </span>
                                  <span>
                                    RM{" "}
                                    {Number(
                                      item.price_at_order * item.quantity
                                    ).toFixed(2)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>

                          <div className="border-t border-gray-200 pt-2 flex justify-between items-center font-bold text-gray-900">
                            <span className="text-xs uppercase text-gray-500">
                              Total Paid
                            </span>
                            <span className="text-[#F04B14] text-sm">
                              RM {Number(order.total_price).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}