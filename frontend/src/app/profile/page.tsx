"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";
import CustomerSpendingDashboard from "@/components/CustomerSpendingDashboard";
import DeleteAccountButton from "@/components/DeleteAccountButton";

type User = { id: string; name: string; email: string; phone_number?: string; role: string };
type Order = { id: string; status: string };
const diets = ["Vegetarian", "Vegan", "Halal", "No Peanuts", "No Dairy", "No Seafood", "No Eggs"];
const button = "inline-flex items-center justify-center rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-semibold transition hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-orange-600";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
  const [preferences, setPreferences] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function load() {
      if (busy) return;
      busy = true;
      try {
        const token = localStorage.getItem("token");
        if (!token) { router.replace("/login"); return; }
        const headers = { Authorization: `Bearer ${token}` };
        const response = await fetch(`${BACKEND_URL}/auth/me`, { headers, signal: controller.signal, cache: "no-store" });
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok) throw new Error("Could not load your account. Please refresh to try again.");
        const account: User = await response.json();
        setUser(account);
        if (account.role === "customer") {
          const response = await fetch(`${BACKEND_URL}/users/me/orders`, { headers, signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Your account loaded, but order totals are temporarily unavailable.");
          setOrders(await response.json());
        }
        setError("");
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load your account."); }
      finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [router]);
  useEffect(() => {
    if (!user) return;
    try {
      const key = `account-preferences:${user.id}`;
      let stored = localStorage.getItem(key);
      // Carry over this browser's existing profile when it belongs to the signed-in account.
      if (!stored && localStorage.getItem("user_id") === user.id) {
        stored = JSON.stringify({ photo: localStorage.getItem("profilePicture") || "", name: localStorage.getItem("preferredName") || "", diets: JSON.parse(localStorage.getItem("dietaryPreferences") || "[]") });
        localStorage.setItem(key, stored);
        ["profilePicture", "preferredName", "dietaryPreferences"].forEach(k => localStorage.removeItem(k));
      }
      const saved = JSON.parse(stored || "{}");
      setPhoto(typeof saved.photo === "string" ? saved.photo : "");
      setName(typeof saved.name === "string" ? saved.name : "");
      setDraft(typeof saved.name === "string" ? saved.name : "");
      setPreferences(Array.isArray(saved.diets) ? saved.diets.filter((d: string) => diets.includes(d)) : []);
    } catch { /* Ignore malformed local preferences. */ }
  }, [user?.id]);
  function save(next: { photo: string; name: string; diets: string[] }) {
    if (!user) return false;
    try { localStorage.setItem(`account-preferences:${user.id}`, JSON.stringify(next)); setError(""); return true; }
    catch { setError("Your browser could not save these preferences. Try a smaller photo or free some browser storage."); return false; }
  }
  function upload(uploaded?: File) {
    if (!uploaded) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(uploaded.type) || uploaded.size > 2 * 1024 * 1024) { setError("Choose a JPG, PNG or WebP photo smaller than 2 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { const next = String(reader.result); if (save({ photo: next, name, diets: preferences })) setPhoto(next); };
    reader.onerror = () => setError("Could not read that photo. Please choose another.");
    reader.readAsDataURL(uploaded);
  }
  function logout() { ["token", "user_id", "userRole", "userName"].forEach(k => localStorage.removeItem(k)); router.replace("/login"); }
  return <main className="min-h-screen bg-[#faf8f3] px-4 py-6 text-stone-900 sm:py-10">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/" className={`${button} bg-white`}>Back to marketplace</Link>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading && <p role="status">Loading your account…</p>}
      {user && <>
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-4 sm:gap-6">
              <div className="w-20 shrink-0 sm:w-24">
                <button onClick={() => file.current?.click()} aria-label="Change profile photo" className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-50 text-3xl font-semibold text-orange-700 ring-1 ring-orange-100 sm:h-24 sm:w-24">
                  {photo ? <img src={photo} alt="Your profile" className="h-full w-full rounded-2xl object-cover" /> : (name || user.name).charAt(0).toUpperCase()}
                  <span className="absolute -bottom-2 rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-600">Edit photo</span>
                </button>
                <button className="mt-5 w-full text-xs font-semibold text-orange-700 underline underline-offset-4" onClick={() => { setDraft(name); setEditing(!editing); }}>{editing ? "Cancel edit" : "Edit profile"}</button>
                <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => upload(e.target.files?.[0])} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">{user.role} account</p>
                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight">{name || user.name}</h1>
                {name && name !== user.name && <p className="text-xs text-stone-500">Registered as {user.name}</p>}
                <p className="mt-2 break-all text-sm text-stone-600">{user.email}</p>
                <p className="mt-1 text-sm text-stone-600">{user.phone_number || "No phone number provided"}</p>
              </div>
              {user.role === "customer" && <div className="flex h-20 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-sky-50 text-sky-900 sm:h-24 sm:w-24"><strong className="text-2xl">{error ? "—" : orders.length}</strong><span className="mt-1 text-center text-[10px] font-medium">Total orders</span></div>}
            </div>
            {editing && <form className="mt-6 space-y-3 rounded-xl bg-stone-50 p-4" onSubmit={e => { e.preventDefault(); const next = draft.trim(); if (save({ photo, name: next, diets: preferences })) { setName(next); setEditing(false); } }}>
              <label className="block text-sm font-medium">Preferred name<input value={draft} maxLength={60} onChange={e => setDraft(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 bg-white p-2" /></label>
              <p className="text-xs text-stone-500">Photo, preferred name and dietary preferences are saved for this account on this browser. Contact support to change registered details.</p>
              <div className="flex flex-wrap items-center gap-3"><button className={button}>Save preferences</button><Link href="/forgot-password" className="text-sm text-orange-700 underline">Change password with email code</Link></div>
            </form>}
          </div>
          <nav aria-label="Account pages" className="grid grid-cols-2 gap-3 border-t border-stone-100 p-5 sm:p-7">
            {user.role === "customer" ? <Link href="/orders" className={`${button} bg-orange-50 text-orange-800`}>Order history</Link> : <Link href={user.role === "admin" ? "/admin/rentals" : "/vendor/dashboard"} className={button}>Dashboard</Link>}
            <button onClick={logout} className={`${button} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}>Log out</button>
          </nav>
          </section>
        <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-rose-50 to-amber-50 p-5 shadow-sm sm:p-7">
            <h2 className="inline-block rounded-lg bg-violet-100 px-3 py-1 font-semibold text-violet-900">Dietary preferences</h2><p className="mt-1 text-xs text-stone-500">Personal reminders on this browser; these do not guarantee ingredients or allergy safety.</p>
            <div className="mt-3 flex flex-wrap gap-2">{diets.map(d => <button key={d} aria-pressed={preferences.includes(d)} onClick={() => { const next = preferences.includes(d) ? preferences.filter(p => p !== d) : [...preferences,d]; if (save({ photo, name, diets: next })) setPreferences(next); }} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${preferences.includes(d) ? "border-violet-500 bg-violet-700 text-white" : "border-violet-200 bg-white/80 text-violet-900"}`}>{d}</button>)}</div>
        </section>
        {orders.some(o => o.status === "ready") && <Link href="/orders" role="status" className="block rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">Your order is ready to collect. View order details.</Link>}
        {user.role === "customer" && <CustomerSpendingDashboard />}
        {user.role !== "admin" && <details className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500"><summary className="cursor-pointer">Account management</summary><p className="my-3 text-xs">Permanently delete your account. This action cannot be undone.</p><DeleteAccountButton /></details>}
      </>}
    </div>
  </main>;
}
