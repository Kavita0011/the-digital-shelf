import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  const user = await requireUser();
  const { data, error } = await getSupabaseAdmin().from("orders")
    .select("*,products(title,slug,preview_image_url),seller_profiles(store_name)")
    .eq("buyer_id", user.id).order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
});
