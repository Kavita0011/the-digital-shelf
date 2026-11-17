"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
export default function AdminCredits() {
  const [userId,setUserId]=useState(""); const [amount,setAmount]=useState(100); const [reason,setReason]=useState(""); const [msg,setMsg]=useState("");
  async function act(action:string){ setMsg(""); try { await apiFetch("/api/admin/credits/"+action,{method:"POST",body:JSON.stringify({userId,amount,reason})}); setMsg(`${action} applied`); } catch(e){ setMsg((e as Error).message); } }
  return <div className="card max-w-xl p-6"><h2 className="font-semibold">Adjust a user&apos;s credit wallet</h2>
    <div className="mt-4 space-y-3"><input className="input" placeholder="User UUID" value={userId} onChange={e=>setUserId(e.target.value)} />
    <input className="input" type="number" value={amount} onChange={e=>setAmount(Number(e.target.value))} />
    <input className="input" placeholder="Reason (5+ chars)" value={reason} onChange={e=>setReason(e.target.value)} />
    <div className="flex flex-wrap gap-2">{["grant","deduct","freeze","reverse"].map(a=><button className="btn-ghost" key={a} onClick={()=>act(a)}>{a}</button>)}</div>
    {msg && <p className="text-sm text-slate-600">{msg}</p>}</div>
  </div>;
}
