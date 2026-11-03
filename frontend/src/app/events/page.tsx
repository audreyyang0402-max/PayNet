"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import { BACKEND_URL } from "@/lib/backend-url";

type CampusEvent = {
  id: string; name: string; location: string; description?: string;
  start_time: string; end_time: string; banner_image_url?: string; event_url?: string;
};
type Shop = {
  id: string; name: string; location: string; description?: string;
  items?: { id: string; name: string; price: number }[];
};

export default function EventsPage() {
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [selected, setSelected] = useState("");
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${BACKEND_URL}/events`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load campus events.");
        const all = (await response.json() as CampusEvent[])
          .filter(event => new Date(event.end_time).getTime() >= Date.now());
        if (cancelled) return;
        setEvents(all);
        if (all[0]) setSelected(all[0].id);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    async function loadVendors() {
      setLoading(true); setError(""); setShops([]);
      try {
        const response = await fetch(`${BACKEND_URL}/events/${selected}/merchants`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load event vendors.");
        if (!cancelled) setShops(await response.json());
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load event vendors.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadVendors();
    return () => { cancelled = true; };
  }, [selected]);

  const selectedEvent = events.find(event => event.id === selected);

  return (
    <main className="min-h-screen bg-[#faf8f4] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <BackLink href="/">Back to marketplace</BackLink>

        {/* Dynamic event header */}
        {selectedEvent ? (
          <header className="relative overflow-hidden rounded-3xl shadow-lg"
            style={selectedEvent.banner_image_url
              ? { backgroundImage: `url(${selectedEvent.banner_image_url})`, backgroundSize: "cover", backgroundPosition: "center" }
              : { background: "linear-gradient(135deg, #5b21b6, #7c3aed, #4338ca)" }}>
            {selectedEvent.banner_image_url && <div className="absolute inset-0 bg-black/55" />}
            <div className="relative z-10 p-6 text-white sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/70">Campus Pop-up</p>
              <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{selectedEvent.name}</h1>
              <p className="mt-1 text-sm text-white/70">📍 {selectedEvent.location}</p>
              <p className="mt-3 max-w-2xl text-sm text-white/80 sm:text-base">
                {selectedEvent.description || "Browse the shops taking part, open a menu, and place your order directly with the vendor."}
              </p>
              {selectedEvent.event_url && (
                <Link href={selectedEvent.event_url}
                  className="mt-4 inline-flex rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-purple-50 shadow">
                  View Event Page →
                </Link>
              )}
            </div>
          </header>
        ) : (
          <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-purple-700 to-indigo-700 p-6 text-white shadow-lg sm:p-9">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-purple-100">Campus Pop-up</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Campus Events</h1>
            <p className="mt-3 max-w-2xl text-sm text-purple-50 sm:text-base">Browse the shops taking part and place your order directly with the vendor.</p>
          </header>
        )}

        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</p>
        )}

        {/* Event selector (if multiple active events) */}
        {events.length > 1 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-semibold text-slate-700">Choose an event
              <select value={selected} onChange={event => setSelected(event.target.value)}
                className="mt-2 block w-full rounded-xl border border-stone-200 bg-stone-50 p-3 text-slate-900">
                {events.map(event => (
                  <option key={event.id} value={event.id}>{event.name} · {event.location}</option>
                ))}
              </select>
            </label>
          </section>
        )}

        {events.length === 0 && !loading && (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="text-2xl mb-2">🎪</p>
            <p className="font-semibold text-slate-800">No active events right now.</p>
            <p className="mt-2 text-sm text-stone-500">Check back soon — events are added by the admin team.</p>
          </section>
        )}

        {/* Vendor list */}
        {loading ? (
          <p className="p-5 text-stone-500">Loading vendors…</p>
        ) : !shops.length && selected ? (
          <section className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="font-semibold text-slate-800">No vendors have been selected for this event yet.</p>
            <p className="mt-2 text-sm text-stone-500">All shops remain available from the campus marketplace in the meantime.</p>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            {shops.map(shop => (
              <article key={shop.id}
                className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-700">Shop / Stall</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">{shop.name}</h2>
                <p className="mt-1 text-sm text-stone-500">📍 {shop.location}</p>
                <p className="mt-4 min-h-10 text-sm text-slate-600">
                  {shop.description || "Open this shop to explore its current menu."}
                </p>
                {shop.items && shop.items.length > 0 && (
                  <p className="mt-3 text-xs text-stone-400">{shop.items.length} menu item{shop.items.length === 1 ? "" : "s"} available</p>
                )}
                <Link href={`/?shop=${shop.id}`}
                  className="mt-5 inline-flex rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700">
                  View Shop & Order
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
