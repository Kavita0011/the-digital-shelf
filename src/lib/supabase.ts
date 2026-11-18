import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServerEnv } from "./env";

export { getSupabaseAdmin } from "./admin-db";

/**
 * Server-side Supabase client bound to the user's session cookies.
 * Queries are parameterized by PostgREST; all writes still pass through the
 * server API where RBAC, CSRF, rate limits, validation and auditing apply.
 * Regenerate strict generated types with `supabase gen types typescript` and
 * add the `Database` generic here for compile-time table checking.
 */
export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component; middleware refreshes the session instead.
        }
      },
    },
  });
}
