import { NextResponse } from "next/server";
import { CSRF_COOKIE_NAME, csrfCookieOptions, verifyCsrfCookie } from "@/lib/csrf";

/**
 * Returns the raw CSRF token to the browser.
 * If the cookie is missing or invalid, issue a fresh one instead of failing —
 * this makes deep links, expired cookies, and multi-tab races self-healing.
 */
export async function GET(req: Request) {
  const raw = req.headers.get("cookie")?.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))?.split("=")[1];
  const token = verifyCsrfCookie(raw ? decodeURIComponent(raw) : undefined);
  if (token) return NextResponse.json({ ok: true, token });

  const csrf = csrfCookieOptions();
  const response = NextResponse.json({ ok: true, token: csrf.value.split(".")[0] });
  response.cookies.set(csrf.name, csrf.value, csrf.options);
  return response;
}
