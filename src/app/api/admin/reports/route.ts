import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin().from("product_reports")
    .select("*,products(title,slug),users!product_reports_reporter_id_fkey(email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
});
