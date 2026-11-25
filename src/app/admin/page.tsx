"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

const METRICS = [
  "buyers",
  "sellers",
  "products",
  "pendingReviews",
  "sales",
  "revenue",
  "platformFees",
  "creditsInCirculation",
  "refunds",
  "disputes",
] as const;

type MetricKey = (typeof METRICS)[number];

const LABELS: Record<MetricKey, string> = {
  buyers: "Buyers",
  sellers: "Shops / sellers",
  products: "Approved products",
  pendingReviews: "Pending reviews",
  sales: "Paid sales",
  revenue: "Gross revenue",
  platformFees: "Platform earnings",
  creditsInCirculation: "Credits in circulation",
  refunds: "Refunds",
  disputes: "Open disputes",
};

function formatMetric(key: MetricKey, value: number): string {
  if (key === "revenue" || key === "platformFees") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
  }
  if (key === "creditsInCirculation") return `${value.toLocaleString()} cr`;
  return value.toLocaleString();
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setStats(await apiFetch<Record<string, number>>("/api/admin/dashboard"));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="card max-w-xl p-6" role="alert">
        <h1 className="text-2xl font-bold">Admin overview</h1>
        <p className="mt-2 text-sm text-red-600">{error}</p>
        <button className="btn-ghost mt-4" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  if (!stats) return <p>Loading…</p>;

  return (
    <>
      <h1 className="text-2xl font-bold">Admin overview</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Buyers hold and spend credits. Sellers receive net earnings from sales. The platform keeps the commission shown
        here as platform earnings. Credit adjustments made by admins are recorded in the audit log.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {METRICS.map((key) => (
          <div className="card p-5" key={key}>
            <p className="text-sm text-slate-500">{LABELS[key]}</p>
            <p className="text-2xl font-bold">{formatMetric(key, stats[key] ?? 0)}</p>
          </div>
        ))}
      </div>
    </>
  );
}
