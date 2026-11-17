import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";

/**
 * Public read helper that degrades gracefully when the database has not been
 * configured (e.g. a fresh checkout being previewed before .env.local exists).
 * Configuration/database errors are logged server-side; buyers simply see an
 * empty catalog instead of a 500. All authenticated/mutating paths still use
 * getSupabaseAdmin() directly and fail closed.
 */
export async function safePublicRead<T>(
  query: (db: SupabaseClient) => Promise<T> | PromiseLike<T>,
  fallback: T,
): Promise<T> {
  try {
    return await query(getSupabaseAdmin());
  } catch (error) {
    console.warn("Public catalog unavailable; showing empty state", error);
    return fallback;
  }
}
