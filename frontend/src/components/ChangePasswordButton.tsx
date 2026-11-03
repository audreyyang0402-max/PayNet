"use client";
import { useState } from "react";
import { BACKEND_URL } from "@/lib/backend-url";
import PasswordInput from "./PasswordInput";

export default function ChangePasswordButton() {
 const [open,setOpen]=useState(false),[currentPassword,setCurrentPassword]=useState(""),[newPassword,setNewPassword]=useState(""),[confirmPassword,setConfirmPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function submit(e: React.FormEvent) {
  e.preventDefault();
  if (newPassword !== confirmPassword) { setError("New passwords do not match."); return; }
  setBusy(true); setError(""); setMessage("");
  try {
   const res = await fetch(`${BACKEND_URL}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
   });
   const data = await res.json();
   if (!res.ok) throw Error(typeof data.detail === "string" ? data.detail : "Could not change your password.");
   setMessage("Password changed. Redirecting you to log in again with your new password...");
   setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
   // Changing the password invalidates the current session token server-side, so sign out here too.
   setTimeout(() => {
    ["token", "user_id", "userRole", "userName"].forEach(k => localStorage.removeItem(k));
    window.location.href = "/login";
   }, 1800);
  } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); }
  finally { setBusy(false); }
 }
 if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-orange-700 underline underline-offset-4">Change password</button>;
 return <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-stone-50 p-5">
  <h3 className="font-bold text-stone-900">Change your password</h3>
  <p className="text-xs text-stone-500">You&apos;ll need your current password. This does not use email verification — if you&apos;ve forgotten your password entirely, use &quot;Forgot password?&quot; on the login page instead.</p>
  {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  {message && <p role="status" className="text-sm text-green-700">{message}</p>}
  <label htmlFor="cp-current" className="block text-sm font-semibold">Current password</label>
  <PasswordInput id="cp-current" label="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required autoComplete="current-password" className="w-full rounded-xl border bg-white p-3" />
  <label htmlFor="cp-new" className="block text-sm font-semibold">New password</label>
  <PasswordInput id="cp-new" label="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={12} autoComplete="new-password" className="w-full rounded-xl border bg-white p-3" />
  <label htmlFor="cp-confirm" className="block text-sm font-semibold">Confirm new password</label>
  <PasswordInput id="cp-confirm" label="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" className="w-full rounded-xl border bg-white p-3" />
  <p className="text-xs text-stone-500">Use at least 12 characters with uppercase, lowercase, a number and a symbol.</p>
  <div className="flex flex-wrap gap-3">
   <button type="button" disabled={busy} onClick={() => { setOpen(false); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setError(""); setMessage(""); }} className="rounded-xl border bg-white px-4 py-2">Cancel</button>
   <button disabled={busy} className="rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Please wait…" : "Change password"}</button>
  </div>
 </form>;
}
