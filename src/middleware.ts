import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Defense-in-depth response headers applied to every route. */
function securityHeaders(): Record<string, string> {
  const isProd = process.env.NODE_ENV === "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' https://*.supabase.co https://*.stripe.com${isProd ? "" : " ws: wss:"}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "object-src 'none'",
  ].join("; ");
  return {
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

/**
 * Refresh Supabase sessions and harden cookies.
 * CSRF cookies are issued only by /api/csrf so the returned token and the
 * browser cookie can never disagree.
 */
export async function middleware(req: NextRequest) {
  const response = NextResponse.next({ request: { headers: req.headers } });
  for (const [name, value] of Object.entries(securityHeaders())) {
    response.headers.set(name, value);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const isProd = process.env.NODE_ENV === "production";
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        cookies.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) => {
          req.cookies.set(name, value);
          // Never let a supabase helper relax the security properties of the
          // session cookies, even if library defaults change.
          response.cookies.set(name, value, {
            ...options,
            httpOnly: true,
            sameSite: "lax",
            secure: isProd,
            path: "/",
          });
        });
      },
    },
  });
  // Anonymous visitors have no session to refresh; skip the Supabase call.
  const hasSession = req.cookies.getAll().some((cookie) => cookie.name.includes("-auth-token"));
  if (hasSession) await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
