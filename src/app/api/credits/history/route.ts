import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  const user = await requireUser();
  const { data, error } = await getSupabaseAdmin().from("credit_transactions")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return ok(data);
});
