"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/backend-url";
type Event = { id: string; name: string; location: string; start_time: string; end_time: string };
type Shop = { id: string; name: string; location: string; description: string };
export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [selected, setSelected] = useState("");
  const [shops, setShops] = useState<Shop[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(`${BACKEND_URL}/events`).then(r => { if (!r.ok) throw Error("Could not load events."); return r.json(); })
      .then((rows: Event[]) => { const current = rows.filter(e => new Date(e.end_time).getTime() >= Date.now()); setEvents(current); setSelected(current[0]?.id || ""); })
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false; setShops([]); setLoading(true); setError("");
    fetch(`${BACKEND_URL}/events/${selected}/merchants`).then(r => { if (!r.ok) throw Error("Could not load event vendors."); return r.json(); })
      .then(rows => { if (!cancelled) setShops(rows); }).catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);
  return <main className="min-h-screen bg-stone-50 p-5 sm:p-8"><div className="mx-auto max-w-5xl space-y-6">
    <Link href="/" className="text-sm text-orange-700">Back to marketplace</Link>
    <header className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-600 p-7 text-white"><h1 className="text-3xl font-bold">Payvolution Event</h1><p className="mt-2">Explore participating shops and order directly from their menus.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {!!events.length && <label className="block text-sm font-medium">Choose an event<select value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 block w-full rounded-xl border bg-white p-3">{events.map(e => <option key={e.id} value={e.id}>{e.name} · {e.location} · {new Date(e.start_time).toLocaleDateString("en-MY")} – {new Date(e.end_time).toLocaleDateString("en-MY")}</option>)}</select></label>}
    {loading ? <p>Loading vendors…</p> : !shops.length ? <p className="rounded-xl border bg-white p-8 text-stone-500">No event vendors announced yet.</p> :
      <div className="grid gap-4 sm:grid-cols-2">{shops.map(s => <article key={s.id} className="rounded-2xl border bg-white p-6"><h2 className="text-xl font-bold">{s.name}</h2><p className="mt-1 text-sm text-stone-500">{s.location}</p><p className="my-3 text-sm">{s.description}</p><Link href={`/?shop=${s.id}`} className="inline-block rounded-xl bg-orange-600 px-4 py-2 font-semibold text-white">View shop & order</Link></article>)}</div>}
  </div></main>;
}
