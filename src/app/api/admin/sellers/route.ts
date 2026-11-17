import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin().from("seller_profiles")
    .select("*,users(email,full_name,status,role)").order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
});
