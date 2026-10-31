"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BACKEND_URL } from "@/lib/backend-url";
import PasswordInput from "./PasswordInput";
export default function DeleteAccountButton() {
 const router=useRouter();
 const [open,setOpen]=useState(false),[password,setPassword]=useState(""),[code,setCode]=useState(""),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 async function request(remove:boolean){
  setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch(`${BACKEND_URL}/users/me/${remove?"account":"deletion-code"}`,{method:remove?"DELETE":"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${localStorage.getItem("token")}`},body:JSON.stringify(remove?{password,code}:{password})});
   const data=await res.json();if(!res.ok)throw Error(typeof data.detail==="string"?data.detail:"Could not complete this request.");
   if(remove){["token","user_id","userRole","userName"].forEach(k=>localStorage.removeItem(k));router.replace("/login");}
   else{setSent(true);setCode("");setMessage("Code sent to your account email. It expires in 10 minutes. Wait 60 seconds before resending.");}
  }catch(e){setError(e instanceof Error?e.message:"Request failed.");}finally{setBusy(false);}
 }
 if(!open)return <button onClick={()=>setOpen(true)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700">Delete my account</button>;
 return <form onSubmit={e=>{e.preventDefault();request(sent);}} className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-5">
  <h3 className="font-bold text-red-900">Confirm account deletion</h3><p className="text-sm text-red-800">This cannot be undone. Your shop will be hidden and your account disabled. Order records are retained. Resolve active orders first.</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{message&&<p role="status" className="text-sm text-stone-700">{message}</p>}
  <label htmlFor="delete-password" className="block text-sm font-semibold">Current password</label>
  <PasswordInput id="delete-password" label="Current password" value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password" className="w-full rounded-xl border border-red-200 bg-white p-3"/>
  {sent&&<><label htmlFor="delete-code" className="block text-sm font-semibold">Email verification code</label><input id="delete-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,8))} className="w-full rounded-xl border bg-white p-3"/><button type="button" disabled={busy||!password} onClick={()=>request(false)} className="text-sm underline">Resend code</button></>}
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>{setOpen(false);setPassword("");setCode("");setSent(false);setError("");setMessage("");}} className="rounded-xl border bg-white px-4 py-2">Cancel</button><button disabled={busy||!password} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy?"Please wait…":sent?"Verify & delete account":"Send deletion code"}</button></div>
 </form>;
}
