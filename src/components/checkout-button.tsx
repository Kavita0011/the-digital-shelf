"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function CheckoutButton({ productIds, couponCode }: { productIds: string[]; couponCode?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        items: productIds.map((productId) => ({ productId })),
      };
      // Coupons reduce the credit total; the API always reloads prices and the
      // wallet balance server-side.
      if (couponCode) payload.couponCode = couponCode;

      const data = await apiFetch<{ redirectUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="btn w-full sm:w-auto" disabled={busy || productIds.length === 0} aria-busy={busy} onClick={checkout}>
        {busy ? "Processing…" : "Pay with credits"}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
