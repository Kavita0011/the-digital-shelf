"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { canSellerEdit } from "@/lib/product-workflow";

export function SellerProductActions({ productId, title, status }: { productId: string; title: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (!window.confirm(`Delete "${title}"? It will be removed from the shelf. Past orders and invoices stay intact.`)) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/seller/products/${productId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {canSellerEdit(status) && (
        <Link
          className="btn-ghost px-2 py-1 text-xs"
          href={`/seller/products/${productId}/edit`}
          aria-label={`Edit ${title}`}
        >
          Edit
        </Link>
      )}
      <button
        type="button"
        className="px-2 py-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
        onClick={() => void remove()}
        disabled={busy || status === "removed"}
        aria-label={`Delete ${title}`}
      >
        {busy ? "Deleting…" : status === "removed" ? "Deleted" : "Delete"}
      </button>
      {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
    </div>
  );
}
