"use client";

import { useState } from "react";
import { apiFetch, clearCsrfTokenCache } from "@/lib/client-api";

export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!tokenHash) {
      setError("This reset link is missing its token. Request a new one.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ tokenHash, newPassword: fd.get("newPassword") }),
      });
      clearCsrfTokenCache();
      setMessage("Password updated. You can now log in.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          className="input"
          name="newPassword"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
        <p className="mt-1 text-xs text-slate-500">Use 12+ characters with upper and lower case letters and a number.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-green-600">{message}</p>}
      <button className="btn w-full" disabled={busy} aria-busy={busy}>
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}
