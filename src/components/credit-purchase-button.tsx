"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function CreditPurchaseButton({ pack, label }: { pack: string; label: string }) {
  async function buy() {
    const data = await apiFetch<{ checkoutUrl: string }>("/api/credits/purchase", { method: "POST", body: JSON.stringify({ pack }) });
    window.location.href = data.checkoutUrl;
  }
  return <button className="btn" onClick={buy}>{label}</button>;
}

interface CreditPack {
  id: string;
  credits: number;
  priceCents: number;
  label: string;
}

/** Loads the configured packs from the purchase API so prices are never duplicated in the UI. */
export function CreditPackPicker() {
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch<{ packs: CreditPack[] }>("/api/credits/purchase")
      .then((data) => { if (active) setPacks(data.packs); })
      .catch((err: unknown) => { if (active) setError((err as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <p className="text-sm text-slate-500" role="status">Loading credit packs…</p>;
  if (error) return <p className="text-sm text-red-600" role="alert">{error}</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {packs.map((pack) => (
        <div className="rounded-xl border border-slate-200 p-4" key={pack.id}>
          <p className="font-semibold">{pack.label}</p>
          <p className="mt-1 text-xs text-slate-500">{pack.credits.toLocaleString("en-US")} credits added to your wallet</p>
          <div className="mt-3">
            <CreditPurchaseButton pack={pack.id} label={pack.label} />
          </div>
        </div>
      ))}
    </div>
  );
}
