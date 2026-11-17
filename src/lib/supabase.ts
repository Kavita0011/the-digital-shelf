import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerEnv } from "./env";

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

/** Service-role client. SERVER ONLY. Bypasses RLS. Never import in client code. */
let adminClient: SupabaseClient | null = null;
export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const env = getServerEnv();
  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
