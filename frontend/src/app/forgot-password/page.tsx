"use client";
import { useState } from "react";
import Link from "next/link";
import { BACKEND_URL } from "@/lib/backend-url";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function request(path: string, body: object) {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Please check the form and try again.");
    return data;
  }
  async function send() {
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/auth/send-verification", { email, purpose: "reset" });
      setSent(true); setCode("");
      setMessage("If this account exists, a code has been sent. Check your inbox and spam folder. Wait 60 seconds before resending.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to send code."); }
    finally { setBusy(false); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sent) { await send(); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await request("/auth/verify-code", { email, purpose: "reset", code, password });
      localStorage.removeItem("token");
      setPassword(""); setCode(""); setDone(true);
      setMessage("Password changed. Please log in again with your new password.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset password."); }
    finally { setBusy(false); }
  }
  const input = "w-full rounded-xl border border-gray-300 p-3 text-gray-900";
  return <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <section className="w-full max-w-md rounded-2xl border bg-white p-8 space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Change or reset password</h1>
      <p className="text-sm text-gray-600">We will verify your email before changing your password.</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">{message}</p>}
      {!done && <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Account email
          <input className={input} type="email" autoComplete="email" required value={email} disabled={sent || busy} onChange={e => setEmail(e.target.value)} />
        </label>
        {sent && <>
          <label className="block text-sm">Email verification code
            <input className={input} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="block text-sm">New password
            <input className={input} type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <p className="text-xs text-gray-600">Use at least 12 characters with uppercase, lowercase, a number and a symbol. Codes expire after 10 minutes.</p>
          <button type="button" disabled={busy} onClick={send} className="text-orange-700 underline">Resend code</button>
          <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); setMessage(""); }} className="ml-4 underline">Change email</button>
        </>}
        <button disabled={busy} className="w-full rounded-xl bg-orange-600 p-3 font-semibold text-white disabled:opacity-50">{busy ? "Please wait..." : sent ? "Verify code and change password" : "Send verification code"}</button>
      </form>}
      <Link href="/login" className="block text-orange-700 underline">Back to login</Link>
    </section>
  </main>;
}
