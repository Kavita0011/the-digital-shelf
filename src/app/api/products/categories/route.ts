import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PUBLIC_CATEGORY_COLUMNS } from "@/lib/public-catalog";

export const GET = route(async () => {
  const { data, error } = await getSupabaseAdmin().from("categories").select(PUBLIC_CATEGORY_COLUMNS).order("name");
  if (error) throw error;
  return ok(data);
});
