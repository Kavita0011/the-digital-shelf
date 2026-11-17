"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function BuyButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function buy() {
    setLoading(true); setError("");
    try {
      const data = await apiFetch<{ checkoutUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ items: [{ productId }], creditsToUse: 0 }),
      });
      window.location.href = data.checkoutUrl;
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  return (
    <div className="mt-8">
      <button className="btn w-full" onClick={buy} disabled={loading}>{loading ? "Redirecting…" : "Buy now with Stripe"}</button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
