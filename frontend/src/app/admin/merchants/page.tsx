"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";

// ─── Types ────────────────────────────────────────────────────────────────────
type Merchant = {
  id: string; name: string; location: string; description: string;
  email: string; phone_number: string; owner_name: string;
  is_active: boolean; is_preview?: boolean; is_deleted?: boolean; duitnow_qr_url?: string; display_order?: number;
};
type Slot = { id: string; time_slot: string; current_bookings: number; max_capacity: number; is_full?: boolean };
type Item = { id: string; name: string; price: number; is_available: boolean; image_url?: string | null; approval_status?: string };
type Order = { id: string; order_number?: string; customer_name: string; status: string; total_price: number; transaction_ref?: string; items: { name: string; quantity: number }[] };

const money = (n: number) => `RM ${Number(n).toFixed(2)}`;
const fmt = (ts: string) => new Date(ts).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const inputCls = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400";

function Spinner({ small }: { small?: boolean }) {
  return <div className={`animate-spin rounded-full border-4 border-orange-200 border-t-orange-500 ${small ? "h-4 w-4" : "h-7 w-7"}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-600",
    pending: "bg-amber-100 text-amber-700",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${map[status] ?? map.pending}`}>{status}</span>;
}

export default function AdminMerchants() {
  const router = useRouter();

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  // mobile: show list or detail
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [selectedId, setSelectedId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editMerchant, setEditMerchant] = useState<Merchant | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editBio, setEditBio] = useState("");

  const [reorderMode, setReorderMode] = useState(false);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [vendorTab, setVendorTab] = useState<"active" | "closed">("active");

  const merchant = merchants.find(m => m.id === selectedId);
  const visibleMerchants = merchants.filter(m => vendorTab === "active" ? !m.is_deleted : !!m.is_deleted);
  const closedCount = merchants.filter(m => m.is_deleted).length;
  const activeCount = merchants.length - closedCount;

  const showToast = useCallback((msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  async function api(path: string, options: { method?: string; body?: object } = {}) {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      method: options.method || "GET",
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}`, "Content-Type": "application/json" },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw Error(typeof data.detail === "string" ? data.detail : "Request failed.");
    return data;
  }

  useEffect(() => {
    if (localStorage.getItem("userRole") !== "admin") { router.replace("/login"); return; }
    api("/admin/merchants/ordered")
      .then((m) => {
        const valid = (m as Merchant[]).filter(x => x.name && x.name.trim() !== "--");
        setMerchants(valid);
        setOrderedIds(valid.filter(x => !x.is_deleted).map(x => x.id));
        setSelectedId(valid.find(x => !x.is_deleted)?.id || valid[0]?.id || "");
      })
      .catch(e => showToast(e.message, "err"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!selectedId) return;
    let stopped = false;
    setDetailLoading(true); setItems([]); setSlots([]); setOrders([]);
    Promise.all([
      api(`/admin/merchants/${selectedId}/items`),
      api(`/admin/merchants/${selectedId}/pickup-slots`),
      api(`/merchants/${selectedId}/orders`),
    ]).then(([i, s, o]) => {
      if (!stopped) { setItems(i); setSlots(s); setOrders(o); }
    }).catch(e => { if (!stopped) showToast(e.message, "err"); })
      .finally(() => { if (!stopped) setDetailLoading(false); });
    return () => { stopped = true; };
  }, [selectedId]);

  function openEdit(m: Merchant) {
    setEditMerchant(m); setEditName(m.name); setEditLocation(m.location); setEditBio(m.description || "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editMerchant) return;
    setBusy(true);
    try {
      const updated = await api(`/admin/merchants/${editMerchant.id}`, {
        method: "PATCH", body: { name: editName, location: editLocation, description: editBio },
      });
      setMerchants(ms => ms.map(m => m.id === editMerchant.id ? { ...m, ...updated } : m));
      showToast("Merchant profile updated.");
      setEditMerchant(null);
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function toggleActive(m: Merchant) {
    if (!window.confirm(`${m.is_active ? "Deactivate" : "Activate"} ${m.name}?`)) return;
    setBusy(true);
    try {
      const r = await api(`/admin/merchants/${m.id}/toggle-active`, { method: "PATCH" });
      setMerchants(ms => ms.map(x => x.id === m.id ? { ...x, is_active: r.is_active } : x));
      showToast(r.message);
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function togglePreview(m: Merchant) {
    setBusy(true);
    try {
      const r = await api(`/admin/merchants/${m.id}/preview`, { method: "PATCH" });
      setMerchants(ms => ms.map(x => x.id === m.id ? { ...x, is_preview: r.is_preview } : x));
      showToast(r.is_preview ? "🔒 Hidden from customers." : "🟢 Now live on marketplace!");
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function closeMerchant(m: Merchant) {
    if (!window.confirm(`Close ${m.name}? This hides it from the Vendors list and the customer marketplace right away. You can still find it under the Closed tab.`)) return;
    setBusy(true);
    try {
      const r = await api(`/admin/merchants/${m.id}`, { method: "DELETE" });
      const remainingActive = merchants.filter(x => x.id !== m.id && !x.is_deleted);
      setMerchants(ms => ms.map(x => x.id === m.id ? { ...x, is_active: false, is_deleted: true } : x));
      setOrderedIds(ids => ids.filter(id => id !== m.id));
      setVendorTab("active");
      setSelectedId(remainingActive[0]?.id || "");
      setMobileView("list");
      showToast(r.message);
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function approveItem(itemId: string, status: "approved" | "rejected") {
    setBusy(true);
    try {
      await api(`/admin/menu-items/${itemId}/approval`, { method: "PATCH", body: { approval_status: status } });
      setItems(is => is.map(i => i.id === itemId ? { ...i, approval_status: status, is_available: status === "approved" } : i));
      showToast(`Item ${status}.`);
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("Delete this menu item?")) return;
    setBusy(true);
    try {
      await api(`/admin/menu-items/${itemId}`, { method: "DELETE" });
      setItems(is => is.filter(i => i.id !== itemId));
      showToast("Item deleted.");
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function deleteSlot(slotId: string) {
    setBusy(true);
    try {
      await api(`/admin/pickup-slots/${slotId}`, { method: "DELETE" });
      setSlots(ss => ss.filter(s => s.id !== slotId));
      showToast("Pickup slot removed.");
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  function moveUp(id: string) {
    const idx = orderedIds.indexOf(id); if (idx <= 0) return;
    const next = [...orderedIds]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; setOrderedIds(next);
  }
  function moveDown(id: string) {
    const idx = orderedIds.indexOf(id); if (idx < 0 || idx >= orderedIds.length - 1) return;
    const next = [...orderedIds]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; setOrderedIds(next);
  }
  async function saveOrder() {
    setBusy(true);
    try {
      await api("/admin/merchants/reorder", { method: "PUT", body: { ordered_ids: orderedIds } });
      setMerchants(ms => [...ms].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)));
      setReorderMode(false);
      showToast("✅ Order saved — customers see vendors in this order.");
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  const sortedForReorder = orderedIds.map(id => merchants.find(m => m.id === id)).filter(Boolean) as Merchant[];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50">
      <Spinner />
    </div>
  );

  // ─── Merchant detail panel ────────────────────────────────────────────────
  function MerchantDetail() {
    if (!merchant) return null;
    const isLive = !merchant.is_preview;
    return (
      <div className="space-y-4">
        {/* Back button — mobile only */}
        <button onClick={() => setMobileView("list")}
          className="flex items-center gap-2 text-sm font-semibold text-orange-600 lg:hidden">
          ← All Vendors
        </button>

        {/* Profile card */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          <div className={`h-1.5 w-full ${isLive ? "bg-gradient-to-r from-emerald-400 to-green-500" : "bg-stone-200"}`} />
          <div className="p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-xl font-black text-slate-900 leading-tight">{merchant.name}</h2>
                <p className="text-sm text-stone-500 mt-0.5">📍 {merchant.location}</p>
              </div>
              <button onClick={() => togglePreview(merchant)} disabled={busy || merchant.is_deleted}
                className={`flex items-center gap-2 rounded-2xl px-4 py-2.5 font-bold text-sm transition disabled:opacity-60 shadow-sm ${
                  isLive
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-300"
                }`}>
                <span className={`h-2.5 w-2.5 rounded-full ${isLive ? "bg-white animate-pulse" : "bg-stone-400"}`} />
                {isLive ? "Live on Marketplace" : "Hidden from Customers"}
              </button>
            </div>

            {merchant.description && (
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">{merchant.description}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-stone-100 pt-4 text-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Owner</p>
                <p className="mt-0.5 font-semibold">{merchant.owner_name}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Contact</p>
                <p className="mt-0.5">{merchant.email}</p>
                <p className="text-stone-500">{merchant.phone_number || "No phone"}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-stone-400 italic">📧 Email and phone are editable by the merchant only.</p>

            {!merchant.is_deleted ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => openEdit(merchant)}
                  className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100 transition">
                  ✏️ Edit Profile
                </button>
                <button onClick={() => toggleActive(merchant)} disabled={busy}
                  className={`rounded-xl px-4 py-2 text-xs font-bold transition disabled:opacity-60 ${merchant.is_active ? "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                  {merchant.is_active ? "Deactivate Stall" : "Activate Stall"}
                </button>
                <button onClick={() => closeMerchant(merchant)} disabled={busy}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-60">
                  🔒 Close Stall
                </button>
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-stone-500">
                🔒 This vendor has been closed by an admin and removed from the marketplace.
              </p>
            )}
          </div>

          {merchant.duitnow_qr_url && (
            <div className="border-t border-stone-100 px-5 py-4 bg-orange-50/40">
              <p className="text-xs font-black uppercase tracking-widest text-orange-400 mb-2">DuitNow QR</p>
              <a href={merchant.duitnow_qr_url.startsWith("http") ? merchant.duitnow_qr_url : `${BACKEND_URL}${merchant.duitnow_qr_url}`}
                target="_blank" rel="noopener noreferrer">
                <img
                  src={merchant.duitnow_qr_url.startsWith("http") ? merchant.duitnow_qr_url : `${BACKEND_URL}${merchant.duitnow_qr_url}`}
                  alt={`DuitNow QR – ${merchant.name}`}
                  loading="lazy"
                  className="h-36 rounded-xl border border-orange-100 bg-white p-2 object-contain hover:shadow-md transition" />
              </a>
            </div>
          )}
        </div>

        {/* Menu Items */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-black text-slate-900">Menu Items <span className="text-stone-400 font-normal">({items.length})</span></h3>
            {detailLoading && <Spinner small />}
          </div>
          <p className="text-[11px] text-amber-600 font-medium mb-4">New items need approval before going live.</p>

          {!detailLoading && items.length === 0 && (
            <p className="text-sm text-stone-400 py-6 text-center bg-stone-50 rounded-xl">No menu items yet.</p>
          )}

          {items.length > 0 && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
              {items.map(item => {
                const status = item.approval_status || "approved";
                return (
                  <div key={item.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                    {item.image_url ? (
                      <img
                        src={item.image_url.startsWith("/") ? `${BACKEND_URL}${item.image_url}` : item.image_url}
                        alt={item.name} loading="lazy" className="h-24 w-full object-cover" />
                    ) : (
                      <div className="h-14 bg-gradient-to-br from-orange-50 to-stone-100 flex items-center justify-center text-2xl">🍽️</div>
                    )}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-bold text-sm leading-tight">{item.name}</p>
                        <p className="shrink-0 font-extrabold text-orange-600 text-sm">{money(item.price)}</p>
                      </div>
                      <div className="mt-1.5"><StatusBadge status={status} /></div>
                      <div className="mt-2.5 flex gap-1.5 flex-wrap">
                        {status !== "approved" && (
                          <button onClick={() => approveItem(item.id, "approved")} disabled={busy}
                            className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition">
                            ✓ Approve
                          </button>
                        )}
                        {status !== "rejected" && (
                          <button onClick={() => approveItem(item.id, "rejected")} disabled={busy}
                            className="rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600 disabled:opacity-50 transition">
                            ✗ Reject
                          </button>
                        )}
                        <button onClick={() => deleteItem(item.id)} disabled={busy}
                          className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pickup Slots */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-900">Pickup Slots <span className="text-stone-400 font-normal">({slots.length})</span></h3>
            {detailLoading && <Spinner small />}
          </div>
          {!detailLoading && slots.length === 0 && (
            <p className="text-sm text-stone-400 py-6 text-center bg-stone-50 rounded-xl">No pickup slots configured.</p>
          )}
          {slots.length > 0 && (
            <ul className="space-y-2">
              {slots.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold">{fmt(s.time_slot)}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                      <span>{s.current_bookings} / {s.max_capacity} booked</span>
                      {s.is_full && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">FULL</span>}
                    </div>
                  </div>
                  <button onClick={() => deleteSlot(s.id)} disabled={busy}
                    className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Orders */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
          <h3 className="font-black text-slate-900 mb-4">Orders <span className="text-stone-400 font-normal">({orders.length})</span></h3>
          {!detailLoading && orders.length === 0 && (
            <p className="text-sm text-stone-400 py-6 text-center bg-stone-50 rounded-xl">No orders yet.</p>
          )}
          {orders.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-auto">
              {orders.map(o => (
                <details key={o.id} className="rounded-xl border border-stone-100 bg-stone-50 p-4">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {o.order_number || o.id.slice(0, 8)} · {o.customer_name} ·{" "}
                    <span className="capitalize">{o.status.replaceAll("_", " ")}</span> · {money(o.total_price)}
                  </summary>
                  <ul className="mt-3 text-sm text-stone-600">{o.items.map((i, n) => <li key={n}>{i.quantity} × {i.name}</li>)}</ul>
                  {o.transaction_ref && (
                    <div className="mt-3 border-t border-stone-200 pt-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">Payment Receipt</p>
                      {o.transaction_ref.startsWith("http") ? (
                        <a href={o.transaction_ref} target="_blank" rel="noopener noreferrer">
                          <img
                            src={o.transaction_ref}
                            alt="Payment receipt"
                            loading="lazy"
                            className="h-28 w-auto rounded-lg border border-stone-200 bg-white object-contain hover:shadow-md transition"
                          />
                        </a>
                      ) : (
                        <p className="break-all text-xs text-stone-400">{o.transaction_ref}</p>
                      )}
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-slate-900">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl transition-all
          ${toast.type === "err" ? "bg-red-600 text-white" : "bg-slate-900 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="lg:flex lg:gap-5 lg:items-start">

          {/* Sidebar */}
          <aside className={`lg:w-72 lg:shrink-0 lg:sticky lg:top-[89px] ${mobileView === "detail" ? "hidden lg:block" : "block"}`}>
            <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-stone-100 px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-widest text-stone-400">
                    {reorderMode ? "Reorder Vendors" : "Vendors"}
                  </p>
                  {vendorTab === "active" && (
                    <button
                      onClick={() => setReorderMode(r => !r)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${reorderMode ? "bg-orange-600 text-white" : "text-orange-600 hover:bg-orange-50"}`}>
                      {reorderMode ? "Cancel" : "⇅ Reorder"}
                    </button>
                  )}
                </div>
                {!reorderMode && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setVendorTab("active")}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${vendorTab === "active" ? "bg-orange-100 text-orange-700" : "text-stone-400 hover:bg-stone-50"}`}>
                      Active ({activeCount})
                    </button>
                    <button onClick={() => setVendorTab("closed")}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${vendorTab === "closed" ? "bg-stone-200 text-stone-700" : "text-stone-400 hover:bg-stone-50"}`}>
                      Closed ({closedCount})
                    </button>
                  </div>
                )}
              </div>

              {reorderMode ? (
                <div className="p-3 space-y-1.5">
                  <p className="text-[10px] text-stone-400 px-1 pb-1">Move vendors up/down. Save to apply on marketplace.</p>
                  {sortedForReorder.map((m, idx) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-xl bg-orange-50 border border-orange-100 px-3 py-2.5">
                      <span className="text-[11px] font-black text-orange-300 w-5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{m.name}</p>
                        <p className="text-[10px] text-stone-400 truncate">{m.location}</p>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <button onClick={() => moveUp(m.id)} disabled={idx === 0}
                          className="h-6 w-6 rounded bg-white border border-stone-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-20 flex items-center justify-center">▲</button>
                        <button onClick={() => moveDown(m.id)} disabled={idx === sortedForReorder.length - 1}
                          className="h-6 w-6 rounded bg-white border border-stone-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-20 flex items-center justify-center">▼</button>
                      </div>
                    </div>
                  ))}
                  <button disabled={busy} onClick={saveOrder}
                    className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-emerald-700 transition">
                    {busy ? "Saving…" : "💾 Save Order"}
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-stone-50 max-h-[70vh] overflow-y-auto">
                  {visibleMerchants.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-stone-400">
                      {vendorTab === "closed" ? "No closed vendors." : "No active vendors."}
                    </li>
                  )}
                  {visibleMerchants.map(m => {
                    const isLive = !m.is_preview;
                    return (
                      <li key={m.id}>
                        <button
                          onClick={() => { setSelectedId(m.id); setMobileView("detail"); }}
                          className={`w-full px-4 py-3.5 text-left transition ${selectedId === m.id ? "bg-orange-50" : "hover:bg-stone-50"}`}>
                          <div className="flex items-center gap-2.5">
                            <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${!m.is_deleted && isLive && m.is_active ? "bg-emerald-500" : "bg-stone-300"}`} />
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-bold truncate ${selectedId === m.id ? "text-orange-700" : "text-slate-800"}`}>{m.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-[11px] text-stone-400 truncate">{m.location}</p>
                                {m.is_deleted && <span className="shrink-0 rounded-full bg-stone-200 px-1.5 py-0.5 text-[9px] font-black uppercase text-stone-500">🔒 Closed</span>}
                                {!m.is_deleted && !m.is_active && <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-red-500">Deactivated</span>}
                                {!m.is_deleted && m.is_active && !isLive && <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-stone-400">Hidden</span>}
                              </div>
                            </div>
                            <span className="text-stone-300 text-xs shrink-0">›</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Detail panel */}
          <div className={`flex-1 min-w-0 ${mobileView === "list" ? "hidden lg:block" : "block"}`}>
            {!merchant ? (
              <div className="rounded-2xl border border-stone-200 bg-white p-12 text-center text-stone-400 shadow-sm">
                Select a vendor to manage
              </div>
            ) : (
              <MerchantDetail />
            )}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editMerchant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-black">Edit Vendor Profile</h3>
                <p className="text-[11px] text-stone-400 mt-0.5">Name, location and bio only.</p>
              </div>
              <button onClick={() => setEditMerchant(null)} className="h-8 w-8 rounded-full bg-stone-100 text-stone-500 font-bold hover:bg-stone-200 flex items-center justify-center">✕</button>
            </div>
            <form onSubmit={saveEdit} className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">Store Name *
                <input required value={editName} onChange={e => setEditName(e.target.value)} className={inputCls} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">Campus Location *
                <input required value={editLocation} onChange={e => setEditLocation(e.target.value)} className={inputCls} />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">Store Bio
                <textarea value={editBio} onChange={e => setEditBio(e.target.value)} className={`${inputCls} resize-none`} rows={3} />
              </label>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={busy} className="flex-1 rounded-xl bg-orange-600 py-2.5 font-bold text-white disabled:opacity-50 hover:bg-orange-700 transition">
                  {busy ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" onClick={() => setEditMerchant(null)} className="flex-1 rounded-xl bg-stone-100 py-2.5 font-bold text-stone-700 hover:bg-stone-200 transition">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
