"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";
import type { Role } from "@/lib/types";
import { RoleModeSwitcher, type ViewMode } from "@/components/role-mode-switcher";

export function ImpersonationBanner({ role, mode = null }: { role: Role; mode?: ViewMode }) {
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
      <div className="flex flex-wrap items-center gap-3">
        <RoleModeSwitcher mode={mode} variant="inline" showReal={false} />
        <button className="btn-ghost" disabled={busy} onClick={exit}>{busy ? "Returning…" : "Return to admin"}</button>
      </div>
    </div>
  );
}
