"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";

type Merchant = { id: string; name: string; location: string };
type Event = { id: string; name: string; location: string; description?: string; start_time: string; end_time: string; banner_image_url?: string; event_url?: string };

const fmt = (ts: string) => new Date(ts).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" });
const inputCls = "mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400";

function Spinner() {
  return <div className="animate-spin rounded-full border-4 border-orange-200 border-t-orange-500 h-7 w-7" />;
}

export default function AdminEvents() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState("");
  const [eventMemberIds, setEventMemberIds] = useState<string[]>([]);

  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const [eventUrl, setEventUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

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
    Promise.all([api("/admin/merchants/ordered"), api("/events")])
      .then(([m, e]) => {
        const valid = (m as Merchant[]).filter(x => x.name && x.name.trim() !== "--");
        setMerchants(valid);
        setEvents(e);
        const first = (e as Event[]).find(ev => new Date(ev.end_time).getTime() >= Date.now());
        if (first) setEventId(first.id);
      })
      .catch(ex => showToast(ex.message, "err"))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => {
    if (!eventId) return;
    api(`/admin/events/${eventId}/merchant-ids`).then(setEventMemberIds).catch(ex => showToast(ex.message, "err"));
  }, [eventId]);

  async function createEvent(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      if (new Date(eventEnd) <= new Date(eventStart)) throw Error("End must be after start.");
      const created = await api("/events", {
        method: "POST",
        body: { name: eventName, location: eventLocation, description: eventDesc,
          event_date: eventStart.slice(0, 10), start_time: `${eventStart}:00+08:00`, end_time: `${eventEnd}:00+08:00`, merchant_ids: [] },
      });
      if (bannerFile && created.id) {
        const fd = new FormData(); fd.append("banner_file", bannerFile);
        await fetch(`${BACKEND_URL}/admin/events/${created.id}/banner`, {
          method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd,
        });
      }
      if (eventUrl && created.id) {
        await api(`/admin/events/${created.id}`, { method: "PATCH", body: { event_url: eventUrl } });
      }
      const refreshed = await api("/events");
      setEvents(refreshed); setEventId(created.id); setEventMemberIds([]);
      showToast(`Event "${eventName}" created.`);
      setEventName(""); setEventLocation(""); setEventDesc(""); setEventStart(""); setEventEnd(""); setEventUrl(""); setBannerFile(null); setBannerPreview(null);
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function deleteEvent() {
    if (!eventId || !window.confirm("Delete this event?")) return;
    setBusy(true);
    try {
      await api(`/events/${eventId}`, { method: "DELETE" });
      setEvents(evs => evs.filter(e => e.id !== eventId));
      setEventId(""); setEventMemberIds([]);
      showToast("Event deleted.");
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function toggleEventMerchant(merchantId: string) {
    setBusy(true);
    try {
      if (eventMemberIds.includes(merchantId)) {
        await api(`/events/${eventId}/merchants/${merchantId}`, { method: "DELETE" });
        setEventMemberIds(ids => ids.filter(id => id !== merchantId));
        showToast("Vendor removed from event.");
      } else {
        await api(`/events/${eventId}/merchants`, { method: "POST", body: { merchant_id: merchantId } });
        setEventMemberIds(ids => [...ids, merchantId]);
        showToast("Vendor added to event.");
      }
    } catch (ex: any) { showToast(ex.message, "err"); }
    finally { setBusy(false); }
  }

  async function replaceBanner(targetEventId: string, file: File) {
    const fd = new FormData(); fd.append("banner_file", file);
    const res = await fetch(`${BACKEND_URL}/admin/events/${targetEventId}/banner`, {
      method: "PATCH", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd,
    });
    if (!res.ok) throw Error("Banner upload failed.");
    return res.json();
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50"><Spinner /></div>
  );

  return (
    <div className="min-h-screen bg-[#f7f6f3] text-slate-900">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl
          ${toast.type === "err" ? "bg-red-600 text-white" : "bg-slate-900 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="space-y-5 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:space-y-0">

          <div className="space-y-5">
            {/* Create event */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-black text-slate-900">Create New Event</h2>
              <p className="mt-0.5 text-xs text-stone-400">Events appear as a live banner on the marketplace homepage.</p>
              <form onSubmit={createEvent} className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Event Name *
                  <input required value={eventName} onChange={e => setEventName(e.target.value)} className={inputCls} placeholder="e.g. SDG Day 2026" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Location *
                  <input required value={eventLocation} onChange={e => setEventLocation(e.target.value)} className={inputCls} placeholder="e.g. Sunway Boulevard" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500 sm:col-span-2">Description
                  <textarea value={eventDesc} onChange={e => setEventDesc(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="What's this event about?" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Starts (MY Time) *
                  <input required type="datetime-local" value={eventStart} onChange={e => setEventStart(e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500">Ends (MY Time) *
                  <input required type="datetime-local" value={eventEnd} onChange={e => setEventEnd(e.target.value)} className={inputCls} />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500 sm:col-span-2">In-App Event Page URL
                  <input value={eventUrl} onChange={e => setEventUrl(e.target.value)} className={inputCls} placeholder="/events/sdg-day" />
                </label>
                <label className="text-xs font-bold uppercase tracking-wide text-stone-500 sm:col-span-2">Event Poster / Banner
                  <input type="file" accept="image/*"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { setBannerFile(f); setBannerPreview(URL.createObjectURL(f)); } }}
                    className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer" />
                  {bannerPreview && (
                    <div className="mt-2 flex items-center gap-3">
                      <img src={bannerPreview} alt="Preview" className="h-20 rounded-xl object-cover border border-orange-200" />
                      <button type="button" onClick={() => { setBannerFile(null); setBannerPreview(null); }} className="text-xs text-red-600 font-semibold">Remove</button>
                    </div>
                  )}
                </label>
                <button disabled={busy} className="sm:col-span-2 rounded-xl bg-orange-600 py-3 font-bold text-white disabled:opacity-50 hover:bg-orange-700 transition">
                  {busy ? "Creating…" : "Create Event"}
                </button>
              </form>
            </div>

            {/* Vendor picker for selected event */}
            {eventId && (
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="font-black text-slate-900">Vendors in This Event</h2>
                <p className="mt-0.5 text-xs text-stone-400">{eventMemberIds.length} vendor{eventMemberIds.length !== 1 ? "s" : ""} added</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {merchants.map(m => {
                    const included = eventMemberIds.includes(m.id);
                    return (
                      <div key={m.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${included ? "border-orange-200 bg-orange-50" : "border-stone-200 bg-stone-50"}`}>
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{m.name}</p>
                          <p className="text-[11px] text-stone-400">{m.location}</p>
                        </div>
                        <button disabled={busy} onClick={() => toggleEventMerchant(m.id)}
                          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${included ? "bg-red-50 text-red-700 hover:bg-red-100" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}>
                          {included ? "Remove" : "Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Manage existing event */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-black text-slate-900 mb-3">Manage Existing Event</h2>
            <select className={inputCls} value={eventId} onChange={e => setEventId(e.target.value)}>
              <option value="">— select an event —</option>
              {events.filter(e => new Date(e.end_time).getTime() >= now).map(e => (
                <option key={e.id} value={e.id}>{e.name} · {e.location}</option>
              ))}
              {events.filter(e => new Date(e.end_time).getTime() < now).map(e => (
                <option key={e.id} value={e.id}>[Past] {e.name}</option>
              ))}
            </select>

            {eventId && (() => {
              const ev = events.find(e => e.id === eventId);
              if (!ev) return null;
              return (
                <div className="mt-4 space-y-4">
                  {ev.banner_image_url && (
                    <img src={ev.banner_image_url} alt="Event banner"
                      className="w-full h-28 rounded-xl object-cover border border-stone-200" />
                  )}
                  <div>
                    <p className="font-bold text-slate-900">{ev.name}</p>
                    <p className="text-xs text-stone-500">📍 {ev.location}</p>
                    {ev.description && <p className="text-xs text-stone-500 mt-1">{ev.description}</p>}
                    {ev.event_url && <p className="text-xs text-orange-600 mt-1">🔗 {ev.event_url}</p>}
                    <p className="text-xs text-stone-400 mt-1">{fmt(ev.start_time)} → {fmt(ev.end_time)}</p>
                  </div>
                  <label className="cursor-pointer flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-100 transition w-fit">
                    📷 Replace Poster
                    <input type="file" accept="image/*" className="hidden"
                      onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return;
                        setBusy(true);
                        try {
                          await replaceBanner(eventId, f);
                          const refreshed = await api("/events");
                          setEvents(refreshed);
                          showToast("Banner updated.");
                        } catch (ex: any) { showToast(ex.message, "err"); }
                        finally { setBusy(false); }
                      }} />
                  </label>
                  <button disabled={busy} onClick={deleteEvent}
                    className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100 transition disabled:opacity-50">
                    🗑️ Delete This Event
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
