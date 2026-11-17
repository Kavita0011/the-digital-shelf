import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const limit = Math.min(48, Math.max(1, Number(url.searchParams.get("limit") ?? 24)));
  const category = url.searchParams.get("category");
  const from = (page - 1) * limit;

  let query = getSupabaseAdmin()
    .from("products")
    .select("id,title,slug,short_description,price,currency,preview_image_url,category_id,is_featured,created_at", { count: "exact" })
    .eq("status", "approved")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  if (category) query = query.eq("category_id", category);

  const { data, count, error } = await query;
  if (error) throw error;
  return ok({ products: data, total: count ?? 0, page, limit });
});
