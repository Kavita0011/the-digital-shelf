"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: new FormData(e.currentTarget).get("email") }),
      });
      setMessage("If that account exists, a reset link is on its way.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      <div>
        <label className="label" htmlFor="resetEmail">Account email</label>
        <input id="resetEmail" className="input" name="email" type="email" autoComplete="email" required />
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {message && <p role="status" className="text-sm text-green-600">{message}</p>}
      <button className="btn w-full" disabled={busy} aria-busy={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
