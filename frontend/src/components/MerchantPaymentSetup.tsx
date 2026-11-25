"use client";

import { useRef, useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
import { getErrorMessage } from "@/lib/errors";

interface MerchantPaymentSetupProps {
  qrUrl: string;
  onQrUploaded: (url: string) => void;
}

export default function MerchantPaymentSetup({ qrUrl, onQrUploaded }: MerchantPaymentSetupProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function uploadQr(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a QR image first.");
      return;
    }

    setUploading(true);
    setMessage("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("qr_file", file);
      const response = await fetch(`${BACKEND_URL}/merchants/me/qr-upload`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not upload the QR image.");
      if (typeof data.duitnow_qr_url !== "string" || !data.duitnow_qr_url) {
        throw new Error("The server did not return the uploaded QR image.");
      }
      onQrUploaded(data.duitnow_qr_url);
      setMessage("DuitNow QR updated.");
      if (fileRef.current) fileRef.current.value = "";
    } catch (caught: unknown) {
      setError(getErrorMessage(caught, "Could not upload the QR image."));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-stone-900">Payment setup</h2>
      <p className="mt-1 text-sm text-stone-600">Upload the DuitNow QR that customers should scan at checkout.</p>
      <form onSubmit={uploadQr} className="mt-5 space-y-4">
        <label htmlFor="merchant-qr-file" className="block text-sm font-semibold text-stone-700">DuitNow QR image</label>
        <input ref={fileRef} id="merchant-qr-file" type="file" accept="image/png,image/jpeg,image/webp" required
          className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-700 file:mr-4 file:rounded-lg file:border-0 file:bg-orange-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-700" />
        {qrUrl && <div className="w-fit rounded-xl border border-stone-200 bg-stone-50 p-3">
          <p className="mb-2 text-xs font-semibold text-stone-600">Current QR</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUrl.startsWith("http") ? qrUrl : `${BACKEND_URL}${qrUrl}`} alt="Current DuitNow QR" className="h-36 w-36 rounded-lg bg-white object-contain p-1" />
        </div>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        <button type="submit" disabled={uploading} className="rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50">
          {uploading ? "Uploading…" : "Upload QR"}
        </button>
      </form>
    </section>
  );
}
