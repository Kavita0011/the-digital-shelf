import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin().from("users")
    .select("id,email,full_name,role,status,created_at").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return ok(data);
});
