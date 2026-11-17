"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function DownloadLink({ orderId }: { orderId: string }) {
  const [error, setError] = useState("");
  async function download() {
    setError("");
    try {
      const data = await apiFetch<{ url: string }>(`/api/buyer/downloads/${orderId}`);
      window.location.href = data.url;
    } catch (e) { setError((e as Error).message); }
  }
  return <span><button className="text-brand-600 hover:underline" onClick={download}>Get link</button>{error && <span className="block text-xs text-red-600">{error}</span>}</span>;
}
