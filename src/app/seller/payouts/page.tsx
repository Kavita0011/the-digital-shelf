"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
export default function PayoutsPage() {
  const [url,setUrl]=useState(""); const [error,setError]=useState("");
  async function onboard(){ setError(""); try { const d=await apiFetch<{onboardingUrl:string}>("/api/seller/connect",{method:"POST"}); setUrl(d.onboardingUrl); } catch(e){ setError((e as Error).message); } }
  return <><h1 className="text-2xl font-bold">Payouts</h1><p className="mt-2 text-slate-600">Connect a Stripe Express account to receive seller payouts. Platform commission is collected automatically.</p><button className="btn mt-6" onClick={onboard}>Set up Stripe Connect</button>{url && <a className="mt-4 block text-brand-600" href={url}>Continue Stripe onboarding →</a>}{error && <p className="mt-4 text-sm text-red-600">{error}</p>}</>;
}
