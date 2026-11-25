"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export type ViewMode = "buyer" | "seller" | "admin" | null;

const MODES = ["buyer", "seller", "admin"] as const;
type ModeKey = (typeof MODES)[number];
type BusyKey = "real" | ModeKey;

interface RoleModeSwitcherProps {
  mode: ViewMode;
  variant?: "card" | "inline";
  showReal?: boolean;
}

function destinationFor(mode: ViewMode): string {
  if (mode === "buyer") return "/buyer/dashboard";
  if (mode === "seller") return "/seller/dashboard";
  return "/admin";
}

export function RoleModeSwitcher({ mode, variant = "card", showReal = true }: RoleModeSwitcherProps) {
  const [busyKey, setBusyKey] = useState<BusyKey | "">("");
  const [error, setError] = useState("");

  async function switchTo(next: ViewMode) {
    const key: BusyKey = next ?? "real";
    if (busyKey || next === mode) return;
    setBusyKey(key);
    setError("");
    try {
      if (next === null) {
        await apiFetch("/api/admin/impersonate", { method: "DELETE" });
      } else {
        await apiFetch("/api/admin/impersonate", {
          method: "POST",
          body: JSON.stringify({ role: next }),
        });
      }
      window.location.href = destinationFor(next);
    } catch (caught) {
      setError((caught as Error).message);
      setBusyKey("");
    }
  }

  const options: { key: BusyKey; label: string; mode: ViewMode }[] = [
    ...(showReal ? [{ key: "real" as const, label: "Real admin", mode: null }] : []),
    ...MODES.map((item) => ({ key: item, label: item[0].toUpperCase() + item.slice(1), mode: item })),
  ];

  const className = variant === "inline"
    ? "flex flex-wrap items-center gap-1.5"
    : "card flex flex-wrap items-center gap-2 p-4";

  return (
    <div>
      <div className={className} role="group" aria-label="Switch view mode">
        {variant === "card" && <span className="text-sm font-medium">View mode:</span>}
        {options.map((option) => {
          const active = option.mode === mode;
          return (
            <button
              key={option.key}
              type="button"
              className={active ? "btn" : "btn-ghost"}
              aria-pressed={active}
              disabled={Boolean(busyKey)}
              onClick={() => switchTo(option.mode)}
            >
              {busyKey === option.key ? "Switching…" : option.label}
            </button>
          );
        })}
        {variant === "card" && (
          <span className="ml-auto text-xs text-slate-500">Only your view changes; stored roles stay the same.</span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
