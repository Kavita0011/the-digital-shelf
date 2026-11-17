"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
export default function PlatformSettings() {
  const [settings,setSettings]=useState<any[]>([]); const [msg,setMsg]=useState("");
  useEffect(()=>{ apiFetch<any[]>("/api/admin/settings").then(setSettings).catch(e=>setMsg(e.message)); },[]);
  async function save(s:any){ try { await apiFetch("/api/admin/settings",{method:"PATCH",body:JSON.stringify({key:s.key,value:s.value})}); setMsg("Saved"); } catch(e){ setMsg((e as Error).message); } }
  return <div className="card max-w-2xl p-6"><h2 className="font-semibold">Platform settings (super admin)</h2><div className="mt-4 space-y-3">{settings.map(s=><div key={s.id} className="flex items-center justify-between gap-4 border-t pt-3"><span className="text-sm">{s.key}</span><input className="input max-w-32" value={JSON.stringify(s.value)} onChange={e=>{try{ s.value=JSON.parse(e.target.value);}catch{}}}/><button className="btn-ghost text-xs" onClick={()=>save(s)}>Save</button></div>)}</div>{msg && <p className="mt-4 text-sm">{msg}</p>}</div>;
}
