"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { Role } from "@/lib/types";

export function ImpersonationBanner({ role }: { role: Role }) {
  const [busy, setBusy] = useState(false);

  async function exit() {
    setBusy(true);
    try {
      await apiFetch("/api/admin/impersonate", { method: "DELETE" });
      window.location.href = "/admin";
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p><strong>View-as mode.</strong> You are seeing the site as a <strong>{role}</strong>. Your real account is still super_admin.</p>
      <button className="btn-ghost" disabled={busy} onClick={exit}>{busy ? "Returning…" : "Return to admin"}</button>
    </div>
  );
}
