"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client-api";
import type { Role } from "@/lib/types";

type LoginResult = { authenticated: boolean; role: Role };
type RegisterResult = { userId: string; requiresConfirmation: boolean };

function dashboardFor(role: Role): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  if (role === "seller") return "/seller/dashboard";
  return "/buyer/dashboard";
}

export function LoginForm() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const result = await apiFetch<LoginResult>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      setDone(true);
      window.location.href = dashboardFor(result.role);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {done && <p className="text-sm text-green-600" role="status">Logged in. Redirecting…</p>}
      <div>
        <label className="label" htmlFor="login-email">Email</label>
        <input id="login-email" className="input" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="login-password">Password</label>
        <input id="login-password" className="input" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Link className="block text-sm text-brand-600 hover:underline" href="/forgot-password">Forgot password?</Link>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
    </form>
  );
}

export function RegisterForm({ seller = false }: { seller?: boolean }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const result = await apiFetch<RegisterResult>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"), password: fd.get("password"), fullName: fd.get("fullName"),
          role: seller ? "seller" : "buyer", acceptedTerms: true,
        }),
      });
      setRequiresConfirmation(result.requiresConfirmation);
      setDone(true);
      if (!result.requiresConfirmation) window.location.href = "/buyer/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {done && (
        <p className="text-sm text-green-600" role="status">
          {requiresConfirmation
            ? "Account created. Check your email to confirm it."
            : "Account created. Redirecting…"}
        </p>
      )}
      <div>
        <label className="label" htmlFor="register-name">Full name</label>
        <input id="register-name" className="input" name="fullName" required minLength={2} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="register-email">Email</label>
        <input id="register-email" className="input" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="register-password">Password (12+ chars, upper, lower, number)</label>
        <input id="register-password" className="input" name="password" type="password" required minLength={12} autoComplete="new-password" />
      </div>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" required /> I accept the terms of service and privacy policy.
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? "Creating account…" : seller ? "Create seller account" : "Create account"}</button>
    </form>
  );
}
