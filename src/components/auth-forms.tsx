"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, clearCsrfTokenCache } from "@/lib/client-api";

export function LoginForm() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      setDone(true);
      clearCsrfTokenCache();
      window.location.href = "/buyer/dashboard";
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {done && <p className="text-sm text-green-600">Logged in. Redirecting…</p>}
      <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
      <div><label className="label">Password</label><input className="input" name="password" type="password" autoComplete="current-password" required /></div>
      <Link className="block text-sm text-brand-600 hover:underline" href="/forgot-password">Forgot password?</Link>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full">Log in</button>
    </form>
  );
}

export function RegisterForm({ seller = false }: { seller?: boolean }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"), password: fd.get("password"), fullName: fd.get("fullName"),
          role: seller ? "seller" : "buyer", acceptedTerms: true,
        }),
      });
      setDone(true);
    } catch (err) { setError((err as Error).message); }
  }
  return (
    <form onSubmit={submit} className="card space-y-4 p-6">
      {done && <p className="text-sm text-green-600">Account created. Check your email to confirm.</p>}
      <div><label className="label">Full name</label><input className="input" name="fullName" required minLength={2} /></div>
      <div><label className="label">Email</label><input className="input" name="email" type="email" required /></div>
      <div><label className="label">Password (12+ chars, upper, lower, number)</label><input className="input" name="password" type="password" required minLength={12} /></div>
      <label className="flex gap-2 text-sm"><input type="checkbox" required /> I accept the terms of service and privacy policy.</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full">{seller ? "Create seller account" : "Create account"}</button>
    </form>
  );
}
