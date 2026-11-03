"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { FormEvent, useCallback, useEffect, useState } from "react";

interface RefundRecord {
  id: string;
  order_id: string;
  order_number?: string | null;
  amount: number;
  status: string;
  status_label: string;
  method?: string | null;
  reason: string;
  rejection_note?: string | null;
  customer_name?: string;
  customer_email?: string;
  merchant_name?: string;
  legal_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  duitnow_qr_url?: string | null;
  proof_url?: string | null;
  merchant_note?: string | null;
  customer_dispute_note?: string | null;
  admin_note?: string | null;
  admin_approved_at?: string | null;
  created_at?: string | null;
  history?: Array<{
    id: string; action: string; actor_role: string; from_status?: string | null;
    to_status: string; note?: string | null; evidence_url?: string | null; created_at?: string | null;
  }>;
}

const STATUS_COLOURS: Record<string, string> = {
  awaiting_customer: "bg-amber-100 text-amber-800",
  pending_admin_approval: "bg-cyan-100 text-cyan-800",
  awaiting_refund: "bg-blue-100 text-blue-800",
  proof_submitted: "bg-violet-100 text-violet-800",
  customer_confirmed: "bg-emerald-100 text-emerald-800",
  disputed: "bg-red-100 text-red-800",
  verified: "bg-stone-100 text-stone-700",
};

const METHOD_LABELS: Record<string, string> = {
  online_bank: "Online bank transfer",
  online_qr: "DuitNow QR",
  walk_in: "Walk-in cash",
};

export default function RefundManagement({ audience, embedded = false }: { audience: "merchant" | "admin"; embedded?: boolean }) {
  const [rows, setRows] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const endpoint = audience === "admin" ? "/admin/refunds" : "/merchants/me/refunds";
      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not load refund cases.");
      setRows(data); setError("");
    } catch (err) { if (!silent) setError(err instanceof Error ? err.message : "Could not load refund cases."); }
    finally { if (!silent) setLoading(false); }
  }, [audience]);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (!document.hidden) load(true); }, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  async function uploadProof(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault(); setBusyId(id); setError("");
    try {
      const body = new FormData(event.currentTarget);
      const response = await fetch(`${BACKEND_URL}/refunds/${id}/proof`, {
        method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not upload refund proof.");
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not upload refund proof."); }
    finally { setBusyId(null); }
  }

  async function adminReview(id: string, action: "approve" | "verify" | "reopen") {
    const current = rows.find((row) => row.id === id);
    const note = action === "approve"
      ? window.prompt("Optional approval note for the merchant:") || ""
      : action === "reopen"
      ? window.prompt("What must the merchant correct?")
      : current?.status === "disputed"
        ? window.prompt("Record how this dispute was resolved before closing it:")
        : window.prompt("Optional admin note:") || "";
    if ((action === "reopen" || current?.status === "disputed") && !note) return;
    setBusyId(id); setError("");
    try {
      const response = await fetch(`${BACKEND_URL}/admin/refunds/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify({ action, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not review the refund.");
      await load(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not review the refund."); }
    finally { setBusyId(null); }
  }

  return (
    <section className={embedded ? "space-y-4" : "mx-auto max-w-6xl px-4 py-6 space-y-4"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">Audited manual refunds</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Refund cases</h1>
          <p className="mt-1 text-sm text-stone-500">
            {audience === "admin"
              ? "Review customer refund details first. Only approved cases and payout instructions are released to the merchant."
              : "Only admin-approved refund cases appear here. Complete the refund, then upload its receipt or transfer proof."}
          </p>
        </div>
        <button onClick={() => load()} className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-xs font-bold text-stone-700">Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-stone-400">Loading refund cases…</p> : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          {audience === "admin" ? "No refund requests are waiting for review." : "No admin-approved refund cases right now."}
        </div>
      ) : <div className="space-y-4">{rows.map((refund) => (
        <article key={refund.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
            <div>
              <p className="font-mono text-sm font-black text-slate-900">{refund.order_number || `#${refund.order_id.slice(0, 8).toUpperCase()}`}</p>
              <p className="mt-1 text-xs text-stone-500">
                {refund.customer_name || "Customer"}{refund.merchant_name ? ` · ${refund.merchant_name}` : ""} · RM {Number(refund.amount).toFixed(2)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${STATUS_COLOURS[refund.status] || "bg-stone-100 text-stone-700"}`}>{refund.status_label}</span>
          </div>
          <div className="grid gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="font-bold text-stone-500">Reason</p>
              <p className="mt-1 text-slate-800">{refund.reason.replaceAll("_", " ")}{refund.rejection_note ? ` — ${refund.rejection_note}` : ""}</p>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <p className="font-bold text-stone-500">Refund method</p>
              <p className="mt-1 text-slate-800">{refund.method ? METHOD_LABELS[refund.method] : "Waiting for customer"}</p>
            </div>
          </div>
          {refund.method && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm space-y-1">
            {refund.method === "walk_in" ? <p className="font-semibold text-blue-900">Return RM {Number(refund.amount).toFixed(2)} in cash, issue/sign a receipt, then upload its photo below.</p> : <>
              <p><span className="text-blue-600">Legal name:</span> <strong>{refund.legal_name}</strong></p>
              {refund.method === "online_bank" && <>
                <p><span className="text-blue-600">Bank:</span> <strong>{refund.bank_name}</strong></p>
                <p><span className="text-blue-600">Account:</span> <strong className="font-mono">{refund.account_number}</strong></p>
              </>}
              {refund.duitnow_qr_url && <a href={refund.duitnow_qr_url} target="_blank" rel="noopener noreferrer" className="inline-block pt-1 font-bold text-blue-700 underline">Open customer DuitNow QR ↗</a>}
            </>}
          </div>}
          {refund.proof_url && <a href={refund.proof_url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-bold text-violet-700">View uploaded refund proof ↗</a>}
          {refund.customer_dispute_note && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><strong>Customer dispute:</strong> {refund.customer_dispute_note}</p>}
          {refund.admin_note && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><strong>Admin note:</strong> {refund.admin_note}</p>}
          {refund.history && refund.history.length > 0 && <details className="rounded-xl border border-stone-200 bg-stone-50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-stone-700">Case history ({refund.history.length})</summary>
            <ol className="mt-3 space-y-2 border-l-2 border-stone-200 pl-4">
              {refund.history.map((event) => <li key={event.id} className="text-xs text-stone-600">
                <p><strong className="text-slate-800">{event.action.replaceAll("_", " ")}</strong> · {event.actor_role}{event.created_at ? ` · ${new Date(event.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}` : ""}</p>
                {event.note && <p className="mt-0.5">{event.note}</p>}
                {event.evidence_url && <a href={event.evidence_url} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline">Open evidence from this step ↗</a>}
              </li>)}
            </ol>
          </details>}

          {audience === "merchant" && ["awaiting_refund", "disputed"].includes(refund.status) && (
            <form onSubmit={(event) => uploadProof(event, refund.id)} className="grid gap-3 rounded-xl border border-stone-200 p-4 sm:grid-cols-[1fr,1fr,auto] sm:items-end">
              <label className="text-xs font-bold text-stone-600">Refund receipt / transfer proof
                <input name="proof_file" required type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 block w-full text-xs" />
              </label>
              <label className="text-xs font-bold text-stone-600">Note (optional)
                <input name="note" maxLength={1000} placeholder="Transfer reference or cash receipt note" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-normal" />
              </label>
              <button disabled={busyId === refund.id} className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">
                {busyId === refund.id ? "Uploading…" : refund.proof_url ? "Upload corrected proof" : "Upload proof"}
              </button>
            </form>
          )}
          {audience === "admin" && !refund.admin_approved_at && ["pending_admin_approval", "awaiting_refund"].includes(refund.status) && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <p className="mb-3 text-xs font-semibold text-cyan-900">Check the customer, order, amount, refund method and payout information before releasing this case to the merchant.</p>
              <button disabled={busyId === refund.id} onClick={() => adminReview(refund.id, "approve")} className="rounded-xl bg-cyan-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                {busyId === refund.id ? "Approving…" : "Approve & send to merchant"}
              </button>
            </div>
          )}
          {audience === "admin" && refund.admin_approved_at && ["proof_submitted", "customer_confirmed", "disputed"].includes(refund.status) && <div className="flex flex-wrap gap-2">
            {["customer_confirmed", "disputed"].includes(refund.status) && <button disabled={busyId === refund.id} onClick={() => adminReview(refund.id, "verify")} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Verify & close</button>}
            <button disabled={busyId === refund.id} onClick={() => adminReview(refund.id, "reopen")} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">Return to merchant</button>
          </div>}
        </article>
      ))}</div>}
    </section>
  );
}
