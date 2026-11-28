"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function BuyButton({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function buy() {
    setLoading(true); setError("");
    try {
      const data = await apiFetch<{ redirectUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ items: [{ productId }] }),
      });
      window.location.href = data.redirectUrl;
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  return (
    <div className="mt-8">
      <button className="btn w-full" onClick={buy} disabled={loading}>
        {loading ? "Processing…" : "Buy with credits"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
