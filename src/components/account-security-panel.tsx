"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

interface UserSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  device: string;
  ip: string;
  isCurrent: boolean;
}

interface SecurityData {
  email: string;
  emailConfirmedAt: string | null;
  sessions: UserSession[];
  maxSessions: number;
}

export function AccountSecurityPanel() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<SecurityData>("/api/account/security"));
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resend() {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiFetch<{ sent: boolean; alreadyVerified?: boolean }>("/api/account/resend-confirmation", {
        method: "POST",
        body: "{}",
      });
      setMessage(result.sent ? "Confirmation email sent. Check your inbox." : "This email is already verified.");
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(body: { sessionId: string } | { allOthers: true }) {
    setBusy(true);
    setMessage("");
    try {
      const result = await apiFetch<{ revoked: number }>("/api/account/sessions", {
        method: "DELETE",
        body: JSON.stringify(body),
      });
      setMessage(`Signed out ${result.revoked} device${result.revoked === 1 ? "" : "s"}.`);
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const verified = Boolean(data?.emailConfirmedAt);

  return (
    <section className="card mt-6 p-6">
      <h2 className="text-xl font-semibold">Security</h2>

      <div className="mt-4 border-b pb-4">
        <h3 className="font-medium">Email verification</h3>
        <p className="mt-1 text-sm text-slate-600" role="status">
          {!data ? "Checking status…" : verified
            ? `Verified${data.emailConfirmedAt ? ` on ${new Date(data.emailConfirmedAt).toLocaleDateString()}` : ""}.`
            : `${data.email} is not verified yet.`}
        </p>
        {data && !verified && (
          <button className="btn-ghost mt-3 text-sm" disabled={busy} onClick={() => void resend()}>
            Resend confirmation email
          </button>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-medium">Signed-in devices</h3>
        <p className="mt-1 text-sm text-slate-600">
          {data
            ? `${data.sessions.length} of ${data.maxSessions} devices in use. Signing in on another device ends the oldest session.`
            : "Loading sessions…"}
        </p>

        {data && data.sessions.length > 0 && (
          <ul className="mt-4 divide-y rounded-lg border">
            {data.sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">
                    {session.device}
                    {session.isCurrent && <span className="badge ml-2">This device</span>}
                  </p>
                  <p className="text-slate-500">
                    {session.ip} · last active {new Date(session.lastSeenAt).toLocaleString()}
                  </p>
                </div>
                {!session.isCurrent && (
                  <button
                    className="btn-ghost text-xs"
                    disabled={busy}
                    aria-label={`Sign out ${session.device}`}
                    onClick={() => void revoke({ sessionId: session.id })}
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {data && data.sessions.some((session) => !session.isCurrent) && (
          <button className="btn-ghost mt-4 text-sm" disabled={busy} onClick={() => void revoke({ allOthers: true })}>
            Sign out all other devices
          </button>
        )}
      </div>

      {message && <p role="status" className="mt-4 text-sm text-slate-600">{message}</p>}
    </section>
  );
}
