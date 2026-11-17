"use client";
import { apiFetch } from "@/lib/client-api";
export function CreditPurchaseButton({ pack, label }: { pack: string; label: string }) {
  async function buy() {
    const data = await apiFetch<{ checkoutUrl: string }>("/api/credits/purchase", { method: "POST", body: JSON.stringify({ pack }) });
    window.location.href = data.checkoutUrl;
  }
  return <button className="btn" onClick={buy}>{label}</button>;
}
