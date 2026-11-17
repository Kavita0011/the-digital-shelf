"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

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
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiFetch<Setting[]>("/api/admin/settings").then(setSettings).catch((e: Error) => setMsg(e.message));
  }, []);

  return (
    <div className="card max-w-2xl p-6">
      <h2 className="font-semibold">Platform settings (super admin)</h2>
      <div className="mt-4 space-y-3">
        {settings.map((s) => <SettingRow key={s.id} setting={s} onMessage={setMsg} />)}
      </div>
      {msg && <p role="status" className="mt-4 text-sm">{msg}</p>}
    </div>
  );
}
