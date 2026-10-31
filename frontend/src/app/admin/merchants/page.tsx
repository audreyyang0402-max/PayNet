"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";
type Merchant = { id: string; name: string; location: string; description: string; email: string; phone_number: string; owner_name: string; is_active: boolean; duitnow_qr_url?: string };
type Slot = { id: string; time_slot: string; current_bookings: number; max_capacity: number };
type Item = { id: string; name: string; price: number; is_available: boolean };
type Order = { id: string; order_number?: string; customer_name: string; status: string; total_price: number; transaction_ref?: string; items: { name: string; quantity: number }[] };
type Event = { id: string; name: string; end_time: string };
const money = (n: number) => `RM ${Number(n).toFixed(2)}`;
export default function AdminMerchants() {
 const router = useRouter();
 const [merchants,setMerchants]=useState<Merchant[]>([]), [selected,setSelected]=useState("");
 const [events,setEvents]=useState<Event[]>([]), [eventId,setEventId]=useState("");
 const [slots,setSlots]=useState<Slot[]>([]), [items,setItems]=useState<Item[]>([]), [orders,setOrders]=useState<Order[]>([]);
 const [error,setError]=useState(""), [message,setMessage]=useState(""), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false);
 const [name,setName]=useState("Payvolution Event"), [location,setLocation]=useState("Sunway Boulevard"), [start,setStart]=useState(""), [end,setEnd]=useState("");
 const merchant=merchants.find(m=>m.id===selected);
 async function api(path:string, body?:object) {
   const res=await fetch(`${BACKEND_URL}${path}`, {method:body?"POST":"GET",headers:{Authorization:`Bearer ${localStorage.getItem("token")}`,"Content-Type":"application/json"}, ...(body?{body:JSON.stringify(body)}:{}),cache:"no-store"});
   const data=await res.json(); if(!res.ok) throw Error(typeof data.detail==="string"?data.detail:"Request failed."); return data;
 }
 useEffect(()=>{ if(localStorage.getItem("userRole")!=="admin"){router.replace("/admin/login");return;}
   Promise.all([api("/admin/merchants"),api("/events")]).then(([m,e])=>{setMerchants(m);setEvents(e);setSelected(m[0]?.id||"");setEventId(e[0]?.id||"");}).catch(e=>setError(e.message)).finally(()=>setLoading(false));
 },[router]);
 useEffect(()=>{ if(!selected)return;let stopped=false;setLoading(true);setError("");setItems([]);setSlots([]);setOrders([]);
   Promise.all([api(`/merchants/${selected}/items`),api(`/merchants/${selected}/pickup-slots`),api(`/merchants/${selected}/orders`)]).then(([i,s,o])=>{if(!stopped){setItems(i);setSlots(s);setOrders(o);}}).catch(e=>{if(!stopped)setError(e.message);}).finally(()=>{if(!stopped)setLoading(false);});
   return()=>{stopped=true;};
 },[selected]);
 async function createEvent(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");
   try{if(new Date(end)<=new Date(start))throw Error("End must be after start.");
     const created=await api("/events",{name,location,event_date:start.slice(0,10),start_time:`${start}:00+08:00`,end_time:`${end}:00+08:00`,merchant_ids:[]});
     setEvents(await api("/events"));setEventId(created.id);setMessage("Event created. Select a merchant and assign them below.");
   }catch(e){setError(e instanceof Error?e.message:"Could not create event.");}finally{setBusy(false);}
 }
 async function assign(){setBusy(true);setError("");setMessage("");try{await api(`/events/${eventId}/merchants`,{merchant_id:selected});setMessage("Merchant assigned. Their existing menu now appears through the event shop.");}catch(e){setError(e instanceof Error?e.message:"Could not assign merchant.");}finally{setBusy(false);}}
 const input="mt-1 w-full rounded-xl border border-stone-200 bg-white p-3 text-sm";
 return <main className="min-h-screen bg-stone-50 p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
   <header className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6"><p className="text-xs font-bold uppercase tracking-widest text-orange-700">Administration</p><h1 className="mt-2 text-3xl font-bold">Merchants & events</h1><nav className="mt-4 flex flex-wrap gap-4 text-sm text-orange-700"><Link href="/admin/rentals">Rentals & approvals</Link><Link href="/admin/users">Customers & users</Link><Link href="/admin/analytics">Platform analytics</Link><Link href="/">Marketplace</Link></nav></header>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{message&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
   <label className="block font-semibold">Inspect merchant<select className={input} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a merchant</option>{merchants.map(m=><option key={m.id} value={m.id}>{m.name} — {m.location}</option>)}</select></label>
   {merchant&&<section className="grid gap-4 md:grid-cols-[1fr_240px]"><article className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6"><h2 className="text-2xl font-bold">{merchant.name}</h2><p className="mt-2 text-stone-500">{merchant.location} · {merchant.is_active?"Active":"Inactive"}</p><p className="mt-3">{merchant.description||"No store description yet."}</p><dl className="mt-5 space-y-2 text-sm"><div><dt className="text-stone-500">Owner</dt><dd>{merchant.owner_name}</dd></div><div><dt className="text-stone-500">Contact</dt><dd className="break-all">{merchant.email}</dd><dd>{merchant.phone_number||"No phone provided"}</dd></div></dl></article><article className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"><h2 className="font-bold">Merchant DuitNow QR</h2>{merchant.duitnow_qr_url?<a href={merchant.duitnow_qr_url.startsWith("http")?merchant.duitnow_qr_url:`${BACKEND_URL}${merchant.duitnow_qr_url}`} target="_blank" rel="noopener noreferrer"><img alt={`DuitNow QR for ${merchant.name}`} src={merchant.duitnow_qr_url.startsWith("http")?merchant.duitnow_qr_url:`${BACKEND_URL}${merchant.duitnow_qr_url}`} className="mt-4 w-full rounded-lg bg-white p-2 object-contain"/></a>:<p className="mt-3 text-sm">Not uploaded yet.</p>}</article></section>}
   {loading?<p>Loading merchant records…</p>:merchant&&<>
    <section className="grid gap-4 md:grid-cols-2"><article className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6"><h2 className="font-bold">Menu · {items.length} items</h2><ul className="mt-4 max-h-80 space-y-3 overflow-auto">{items.map(i=><li key={i.id} className="flex justify-between gap-3 border-b pb-2 text-sm"><span>{i.name}<span className="block text-xs text-stone-500">{i.is_available?"Available":"Unavailable"}</span></span><span>{money(i.price)}</span></li>)}</ul>{!items.length&&<p className="mt-3 text-sm text-stone-500">No menu items.</p>}</article><article className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6"><h2 className="font-bold">Pickup slots · Malaysian time</h2><ul className="mt-4 max-h-80 space-y-3 overflow-auto">{slots.map(s=><li key={s.id} className="border-b pb-2 text-sm">{new Date(s.time_slot).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})}<span className="block text-stone-500">{s.current_bookings} / {s.max_capacity} booked</span></li>)}</ul>{!slots.length&&<p className="mt-3 text-sm text-stone-500">No pickup slots configured.</p>}</article></section>
    <section className="rounded-2xl border border-stone-200 bg-white shadow-sm p-6"><h2 className="font-bold">Orders · {orders.length}</h2><div className="mt-4 max-h-96 space-y-3 overflow-auto">{orders.map(o=><details key={o.id} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><summary className="cursor-pointer text-sm font-semibold">{o.order_number||o.id.slice(0,8)} · {o.customer_name} · {o.status.replaceAll("_"," ")} · {money(o.total_price)}</summary><ul className="mt-3 text-sm">{o.items.map((i,n)=><li key={n}>{i.quantity} × {i.name}</li>)}</ul>{o.transaction_ref&&<p className="mt-2 break-all text-xs">Payment reference / receipt: {o.transaction_ref.startsWith("https://")?<a className="underline" href={o.transaction_ref} target="_blank" rel="noopener noreferrer">View submitted receipt</a>:o.transaction_ref}</p>}</details>)}</div>{!orders.length&&<p className="mt-3 text-sm text-stone-500">No orders yet.</p>}</section>
   </>}
   <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-rose-50 p-6"><h2 className="text-xl font-bold">Event placement</h2><p className="mt-2 text-sm text-stone-600">Create an event with its full date range, then assign participating shops. Shops use their existing menus and pickup slots. Upcoming/current event shops appear in Payvolution Event instead of the campus list; they return after the event ends.</p>
   <form onSubmit={createEvent} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Event name<input required value={name} onChange={e=>setName(e.target.value)} className={input}/></label><label className="text-sm">Location<input required value={location} onChange={e=>setLocation(e.target.value)} className={input}/></label><label className="text-sm">Starts (Malaysia)<input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className={input}/></label><label className="text-sm">Ends (Malaysia)<input required type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className={input}/></label><button disabled={busy} className="rounded-xl bg-violet-700 p-3 font-semibold text-white disabled:opacity-50">Create event</button></form>
   <div className="mt-6 border-t border-violet-200 pt-5"><label className="text-sm">Assign the selected merchant to<select className={input} value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Select event</option>{events.filter(e=>new Date(e.end_time).getTime()>=Date.now()).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label><button disabled={busy||!eventId||!selected} onClick={assign} className="mt-3 rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white disabled:opacity-50">Add {merchant?.name||"merchant"} to event</button></div>
   </section>
 </div></main>;
}
