"use client";

import { BACKEND_URL } from "@/lib/backend-url";
import { FormEvent, useState } from "react";

export interface RefundCase {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  status_label: string;
  method?: "online_bank" | "online_qr" | "walk_in" | null;
  reason: string;
  rejection_note?: string | null;
  account_last4?: string | null;
  proof_url?: string | null;
  merchant_note?: string | null;
  customer_dispute_note?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  online_bank: "Online bank transfer",
  online_qr: "DuitNow QR refund",
  walk_in: "Walk-in cash refund",
};

export default function CustomerRefundPanel({
  orderId,
  refund,
  onUpdated,
}: {
  orderId: string;
  refund: RefundCase;
  onUpdated: (refund: RefundCase) => void;
}) {
  const [method, setMethod] = useState<"online_bank" | "online_qr" | "walk_in">("online_bank");
  const [legalName, setLegalName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [disputeNote, setDisputeNote] = useState("");

  const token = () => localStorage.getItem("token") || "";

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const body = new FormData();
      body.append("method", method);
      if (method !== "walk_in") body.append("legal_name", legalName);
      if (method === "online_bank") {
        body.append("bank_name", bankName);
        body.append("account_number", accountNumber);
      }
      if (method === "online_qr" && qrFile) body.append("duitnow_qr", qrFile);
      const response = await fetch(`${BACKEND_URL}/orders/${orderId}/refund/request`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not submit the refund request.");
      onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit the refund request.");
    } finally { setBusy(false); }
  }

  async function answerProof(action: "confirm" | "dispute") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${BACKEND_URL}/refunds/${refund.id}/customer-response`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ action, note: action === "dispute" ? disputeNote : undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not update the refund case.");
      setDisputing(false); onUpdated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the refund case.");
    } finally { setBusy(false); }
  }

  if (refund.status === "awaiting_customer") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-amber-700">Refund available</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">Choose how to receive RM {Number(refund.amount).toFixed(2)}</h2>
          <p className="mt-1 text-xs text-slate-600">Your details are shared only with this merchant and Payvolution admins.</p>
        </div>
        <form onSubmit={submitRequest} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["online_bank", "Bank transfer"], ["online_qr", "DuitNow QR"], ["walk_in", "Walk in"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setMethod(value)}
                className={`rounded-xl border px-3 py-3 text-xs font-bold ${method === value ? "border-orange-500 bg-orange-600 text-white" : "border-amber-200 bg-white text-slate-700"}`}>
                {label}
              </button>
            ))}
          </div>
          {method !== "walk_in" && (
            <label className="block text-xs font-bold text-slate-700">Legal full name
              <input required value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={150}
                autoComplete="name" className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal" />
            </label>
          )}
          {method === "online_bank" && <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">Bank name
              <input required value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={100}
                className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal" />
            </label>
            <label className="block text-xs font-bold text-slate-700">Bank account number
              <input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputMode="numeric" autoComplete="off"
                className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm font-normal" />
            </label>
          </div>}
          {method === "online_qr" && <label className="block text-xs font-bold text-slate-700">DuitNow QR image
            <input required type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setQrFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full rounded-xl border border-amber-200 bg-white p-2 text-xs" />
          </label>}
          {method === "walk_in" && <p className="rounded-xl bg-white p-3 text-xs text-slate-600">Visit the stall to receive cash. The merchant must upload the signed refund receipt here, then you confirm that you received it.</p>}
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50">
            {busy ? "Submitting…" : "Submit refund method"}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-700">Refund tracking</p>
          <h2 className="mt-1 text-lg font-black text-slate-900">{refund.status_label}</h2>
          <p className="mt-1 text-xs text-slate-600">
            RM {Number(refund.amount).toFixed(2)} · {refund.method ? METHOD_LABELS[refund.method] : "Method pending"}
            {refund.account_last4 ? ` · Account ending ${refund.account_last4}` : ""}
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-blue-700">Case #{refund.id.slice(0, 8).toUpperCase()}</span>
      </div>
      {refund.proof_url && <a href={refund.proof_url} target="_blank" rel="noopener noreferrer"
        className="block rounded-xl border border-blue-200 bg-white p-3 text-sm font-bold text-blue-700 hover:bg-blue-100">View merchant refund receipt / proof ↗</a>}
      {refund.merchant_note && <p className="rounded-xl bg-white p-3 text-xs text-slate-600"><strong>Merchant note:</strong> {refund.merchant_note}</p>}
      {refund.status === "proof_submitted" && <div className="space-y-3">
        <p className="text-xs text-slate-600">Check your bank balance or cash receipt before confirming.</p>
        {disputing && <textarea value={disputeNote} onChange={(e) => setDisputeNote(e.target.value)} maxLength={1000}
          placeholder="Explain what is missing or incorrect…" className="w-full rounded-xl border border-blue-200 bg-white p-3 text-sm" />}
        {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => answerProof("confirm")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">I received the refund</button>
          <button disabled={busy} onClick={() => disputing ? answerProof("dispute") : setDisputing(true)} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 disabled:opacity-50">
            {disputing ? "Submit problem" : "Report a problem"}
          </button>
        </div>
      </div>}
      {refund.status === "disputed" && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">Payvolution admin and the merchant can see your report. The case remains open.</p>}
      {refund.status === "customer_confirmed" && <p className="text-xs text-emerald-700">You confirmed receipt. An admin can now verify and close the case.</p>}
      {refund.status === "verified" && <p className="text-xs font-semibold text-emerald-700">This refund has been verified and closed.</p>}
    </section>
  );
}
