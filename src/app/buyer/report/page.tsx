"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
export default function ReportProduct(){ const [msg,setMsg]=useState("");
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault(); const fd=new FormData(e.currentTarget); try{ await apiFetch("/api/buyer/reports",{method:"POST",body:JSON.stringify({productId:fd.get("productId"),reason:fd.get("reason"),details:fd.get("details")})}); setMsg("Report submitted for admin review.");}catch(err){setMsg((err as Error).message);} }
 return <><h1 className="text-2xl font-bold">Report a product</h1><form onSubmit={submit} className="card mt-6 max-w-xl space-y-4 p-6"><input className="input" name="productId" placeholder="Product UUID" required/><select className="input" name="reason"><option value="copyright">Copyright</option><option value="malware">Malware</option><option value="misleading">Misleading info</option><option value="quality">Quality</option><option value="other">Other</option></select><textarea className="input" name="details" rows={5} minLength={10} required/><button className="btn">Submit report</button>{msg && <p className="text-sm">{msg}</p>}</form></>; }
