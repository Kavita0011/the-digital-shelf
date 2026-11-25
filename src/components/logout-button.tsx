"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function LogoutButton({ className = "btn-ghost" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" className={className} disabled={busy} onClick={() => void logout()}>
        {busy ? "Logging out…" : "Log out"}
      </button>
      {error && <span className="mt-1 text-xs text-red-600" role="alert">{error}</span>}
    </span>
  );
}
