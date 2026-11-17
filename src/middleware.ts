import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { CSRF_COOKIE_NAME_EDGE, newCsrfTokenEdge } from "@/lib/csrf-edge";

/** Refresh Supabase sessions and set the double-submit CSRF cookie. */
export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: { headers: req.headers } });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() { return req.cookies.getAll(); },
      setAll(cookies: { name: string; value: string; options: CookieOptions }[]) {
        cookies.forEach(({ name, value, options }: { name: string; value: string; options: CookieOptions }) => {
          req.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  await supabase.auth.getUser();

  if (!req.cookies.get(CSRF_COOKIE_NAME_EDGE) && process.env.SESSION_SECRET) {
    const { cookie } = await newCsrfTokenEdge(process.env.SESSION_SECRET);
    response.cookies.set(CSRF_COOKIE_NAME_EDGE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "DENY");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
