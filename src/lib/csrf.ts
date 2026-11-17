import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { requireEnv } from "./env";
import { HttpError } from "./auth";

const COOKIE_NAME = "ds_csrf";
const HEADER_NAME = "x-csrf-token";

function sign(token: string): string {
  return createHmac("sha256", requireEnv("SESSION_SECRET")).update(token).digest("hex");
}

export function newCsrfToken(): { token: string; cookie: string } {
  const token = randomBytes(24).toString("hex");
  return { token, cookie: `${token}.${sign(token)}` };
}

export function verifyCsrfCookie(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const [token, mac] = cookie.split(".");
  if (!token || !mac) return null;
  const expected = Buffer.from(sign(token));
  const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return token;
}

/**
 * Double-submit CSRF check for all mutating API requests.
 * The token is readable to JS only via the initial HTML form and must be
 * echoed in x-csrf-token; the cookie itself is HttpOnly.
 */
export function assertCsrf(req: NextRequest): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return;
  const cookieToken = verifyCsrfCookie(req.cookies.get(COOKIE_NAME)?.value);
  const headerToken = req.headers.get(HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new HttpError(403, "Invalid CSRF token", "csrf_failed");
  }
}

export const CSRF_COOKIE_NAME = COOKIE_NAME;
export const CSRF_HEADER_NAME = HEADER_NAME;
