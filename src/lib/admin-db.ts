import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "./env";

/**
 * Runtime-neutral service-role client. SERVER ONLY. Bypasses RLS.
 * Kept separate from supabase.ts so the Cloudflare queue consumer can use it
 * without importing Next.js request APIs.
 */
let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;
  const env = getServerEnv();
  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}
