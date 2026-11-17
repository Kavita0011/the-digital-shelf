"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function CheckoutButton({ productIds }: { productIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<{ checkoutUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ items: productIds.map((productId) => ({ productId })) }),
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn w-full sm:w-auto" disabled={busy || productIds.length === 0} aria-busy={busy} onClick={checkout}>
        {busy ? "Preparing checkout…" : "Checkout"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
