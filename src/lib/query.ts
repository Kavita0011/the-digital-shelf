import { HttpError } from "./auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;

/** Validate a route parameter before it reaches any database query. */
export function parseUuidParam(value: string, label = "id"): string {
  if (!UUID.test(value)) throw new HttpError(400, `Invalid ${label}`, "invalid_id");
  return value;
}

export function parseSlugParam(value: string): string {
  if (!SLUG.test(value) || value.length > 200) throw new HttpError(400, "Invalid slug", "invalid_slug");
  return value;
}

export function parseTokenParam(value: string): string {
  if (!TOKEN.test(value)) throw new HttpError(400, "Invalid token", "invalid_token");
  return value;
}

/** Whitelist a query-string value instead of trusting arbitrary filter input. */
export function enumParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
  label: string,
): T | null {
  if (value === null || value === "") return null;
  if (!allowed.includes(value as T)) throw new HttpError(400, `Invalid ${label}`, "invalid_query");
  return value as T;
}

/** Bounded, boring string for free-text audit filters (no PostgREST syntax). */
export function patternParam(value: string | null, label: string, maxLength = 120): string | null {
  if (value === null || value === "") return null;
  if (value.length > maxLength || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}`, "invalid_query");
  }
  return value;
}
