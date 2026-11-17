import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  const { data, error } = await getSupabaseAdmin().from("categories").select("*").order("name");
  if (error) throw error;
  return ok(data);
});
