"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

export function AddToCartButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch("/api/cart", {
        method: "POST",
        body: JSON.stringify({ productId, action: "add" }),
      });
      setMessage({ type: "success", text: "Added to cart. View your cart to check out." });
    } catch (error) {
      setMessage({ type: "error", text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button className="btn-ghost w-full" type="button" onClick={() => void add()} disabled={busy}>
        {busy ? "Adding…" : "Add to cart"}
      </button>
      {message && (
        <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-700"}`} role={message.type === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
    </div>
  );
}

export function RemoveFromCartButton({ productId }: { productId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/cart", {
        method: "POST",
        body: JSON.stringify({ productId, action: "remove" }),
      });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button className="text-sm font-medium text-brand-600 hover:underline disabled:opacity-50" type="button" onClick={() => void remove()} disabled={busy}>
        {busy ? "Removing…" : "Remove"}
      </button>
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}
