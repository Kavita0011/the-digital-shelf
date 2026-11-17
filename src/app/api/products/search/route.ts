import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  if (!q) return ok({ products: [] });
  // Escape PostgREST special chars to avoid filter injection.
  const safe = q.replace(/[%,()\\]/g, " ");
  const { data, error } = await getSupabaseAdmin()
    .from("products")
    .select("id,title,slug,short_description,price,currency,preview_image_url")
    .eq("status", "approved")
    .or(`title.ilike.%${safe}%,short_description.ilike.%${safe}%`)
    .limit(48);
  if (error) throw error;
  return ok({ products: data });
});
