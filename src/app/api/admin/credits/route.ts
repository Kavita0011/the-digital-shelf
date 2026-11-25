import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Buyer wallets for admin credit support. Seller earnings are not credit wallets. */
export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id,email,full_name,role,status,credit_wallets(balance,pending_balance,frozen_balance,currency)")
    .eq("role", "buyer")
    .eq("status", "active")
    .order("email", { ascending: true })
    .limit(500);
  if (error) throw error;
  return ok(data ?? []);
});
