"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
export default function AdminDashboard() {
  const [stats,setStats]=useState<Record<string,number>|null>(null);
  useEffect(()=>{ apiFetch<Record<string,number>>("/api/admin/dashboard").then(setStats).catch(()=>{}); },[]);
  if(!stats) return <p>Loading…</p>;
  return <><h1 className="text-2xl font-bold">Admin overview</h1><div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">{Object.entries(stats).map(([k,v])=><div className="card p-5" key={k}><p className="text-sm capitalize text-slate-500">{k.replace(/([A-Z])/g," $1")}</p><p className="text-2xl font-bold">{v.toLocaleString()}</p></div>)}</div></>;
}
