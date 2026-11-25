"use client";

async function getCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error("Could not start a secure request. Refresh the page and try again.");
  const json = await res.json().catch(() => null);
  if (!json?.ok || !json.token) throw new Error("Could not start a secure request. Refresh the page and try again.");
  return json.token as string;
}

/**
 * Kept as a no-op for callers that used to clear a cached token. Tokens are now
 * fetched fresh for every mutation, so there is no client cache to invalidate.
 */
export function clearCsrfTokenCache(): void {}

/** Client fetch helper that attaches a fresh CSRF token to every mutation. */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const isMutation = Boolean(init.method) && init.method !== "GET";
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (isMutation) headers.set("x-csrf-token", await getCsrfToken());

  const res = await fetch(url, { ...init, credentials: "same-origin", headers });
  const json = await res.json().catch(() => null);

  // Retry only a stale CSRF token. A genuine 403 (for example forbidden or
  // insufficient permissions) must not replay a non-idempotent mutation.
  if (isMutation && res.status === 403 && json?.error?.code === "csrf_failed") {
    headers.set("x-csrf-token", await getCsrfToken());
    const retry = await fetch(url, { ...init, credentials: "same-origin", headers });
    const retryJson = await retry.json().catch(() => null);
    if (!retryJson?.ok) throw new Error(retryJson?.error?.message ?? `Request failed (${retry.status})`);
    return retryJson.data as T;
  }

  if (!json?.ok) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}
