"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeAccount() {
    if (confirmation !== "DELETE") {
      setError("Type DELETE to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/account/delete", {
        method: "POST",
        body: JSON.stringify({ confirm: confirmation }),
      });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost text-red-600" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-red-200 bg-red-50 p-4" role="group" aria-label="Delete account">
      <p className="text-sm font-semibold text-red-800">Delete your account?</p>
      <p className="mt-1 text-sm text-red-700">
        This revokes access permanently. Orders, payments, credit history, and audit records are retained for legal and accounting purposes.
      </p>
      <label className="mt-3 block text-sm text-red-800" htmlFor="delete-confirmation">
        Type <strong>DELETE</strong> to confirm
      </label>
      <input
        id="delete-confirmation"
        className="input mt-1 max-w-48"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={busy}
        autoComplete="off"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn bg-red-600 text-white hover:bg-red-700"
          disabled={busy || confirmation !== "DELETE"}
          onClick={() => void removeAccount()}
        >
          {busy ? "Deleting…" : "Permanently delete"}
        </button>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setOpen(false); setConfirmation(""); setError(""); }}>
          Cancel
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </div>
  );
}
