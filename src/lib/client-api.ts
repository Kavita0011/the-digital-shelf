"use client";

let tokenCache: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (tokenCache) return tokenCache;
  const res = await fetch("/api/csrf", { credentials: "same-origin" });
  const json = await res.json();
  tokenCache = json.token ?? null;
  return tokenCache ?? "";
}

/** Client fetch helper that attaches the CSRF token on all mutations. */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isMutation = init.method && init.method !== "GET";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (isMutation) headers.set("x-csrf-token", await getCsrfToken());
  const res = await fetch(url, { ...init, credentials: "same-origin", headers });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}
