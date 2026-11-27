"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function CheckoutButton({
  productIds,
  couponCode,
  creditsToUse,
}: {
  productIds: string[];
  couponCode?: string;
  creditsToUse?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        items: productIds.map((productId) => ({ productId })),
      };
      // Only send optional fields when the caller actually has them; the API
      // always reloads prices, discounts and wallet balances server-side.
      if (couponCode) payload.couponCode = couponCode;
      if (creditsToUse !== undefined) payload.creditsToUse = creditsToUse;

      const data = await apiFetch<{ checkoutUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify(payload),
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
