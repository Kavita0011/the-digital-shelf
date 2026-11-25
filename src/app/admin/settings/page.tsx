"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { LogoutButton } from "@/components/logout-button";
import type { AuthenticatedUser } from "@/lib/types";

interface Setting {
  id: string;
  key: string;
  value: unknown;
}

function SettingRow({ setting, onMessage }: { setting: Setting; onMessage: (message: string) => void }) {
  const [raw, setRaw] = useState(() => JSON.stringify(setting.value ?? ""));
  const [busy, setBusy] = useState(false);

  async function save() {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw; // plain strings are valid setting values too
    }
    setBusy(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ key: setting.key, value }),
      });
      onMessage("Saved");
    } catch (e) {
      onMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t pt-3">
      <span className="text-sm">{setting.key}</span>
      <div className="flex items-center gap-2">
        <input
          aria-label={`${setting.key} value`}
          className="input max-w-32"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <button className="btn-ghost text-xs" disabled={busy} onClick={() => { void save(); }}>Save</button>
      </div>
    </div>
  );
}

export default function PlatformSettings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<Setting[]>("/api/admin/settings").then(setSettings).catch((e: Error) => setMsg(e.message));
    apiFetch<{ user: AuthenticatedUser | null }>("/api/auth/me")
      .then((data) => setUser(data.user))
      .catch((e: Error) => setMsg(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <section className="card max-w-2xl p-6">
        <h2 className="text-xl font-bold">Admin account</h2>
        {user ? (
          <>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Name</dt><dd className="font-medium">{user.fullName ?? "Not set"}</dd></div>
              <div><dt className="text-slate-500">Email</dt><dd className="font-medium break-all">{user.email}</dd></div>
              <div><dt className="text-slate-500">Role</dt><dd className="font-medium capitalize">{user.role.replace("_", " ")}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="font-medium capitalize">{user.status}</dd></div>
            </dl>
            {user.impersonating && (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800" role="status">
                Preview mode is active. Your stored role remains {user.realRole.replace("_", " ")}.
              </p>
            )}
          </>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Loading account…</p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="btn-ghost" href="/notifications">Notifications</Link>
          <Link className="btn-ghost" href="/forgot-password">Reset password</Link>
          <LogoutButton />
        </div>
      </section>

      <section className="card max-w-2xl p-6">
        <h2 className="font-semibold">Platform settings (super admin)</h2>
        <div className="mt-4 space-y-3">
          {settings.map((s) => <SettingRow key={s.id} setting={s} onMessage={setMsg} />)}
        </div>
        {msg && <p role="status" className="mt-4 text-sm">{msg}</p>}
      </section>
    </div>
  );
}
