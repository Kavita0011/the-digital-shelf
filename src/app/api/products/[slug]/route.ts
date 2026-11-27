import { parseSlugParam } from "@/lib/query";
import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";
import { HttpError } from "@/lib/auth";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-catalog";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  const slug = parseSlugParam((await ctx.params).slug);
  const db = getSupabaseAdmin();
  const { data: product, error } = await db.from("products")
    .select(PUBLIC_PRODUCT_COLUMNS).eq("slug", slug).eq("status", "approved").single();
  if (error || !product) throw new HttpError(404, "Product not found", "not_found");

  const { data: seller } = await db.from("seller_profiles")
    .select("store_name,bio,profile_image").eq("id", product.seller_id).single();
  // Views are counted by increment_view_count() on the server-rendered detail
  // page. Keep this read-only API response free of racy counter writes.
  return ok({ product, seller });
});
