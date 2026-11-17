import { ok, route } from "@/lib/api";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireUser, HttpError } from "@/lib/auth";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data } = await db.from("product_files").select("id,product_id,scan_status,scan_provider,scan_result,checksum").eq("id", id).single();
  if (!data) throw new HttpError(404, "Upload not found", "not_found");

  // Only seller who owns the file, or admins, may view scan metadata.
  const { data: product } = await db.from("products").select("seller_id").eq("id", data.product_id).single();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  if (user.role !== "admin" && user.role !== "super_admin" && (!seller || product?.seller_id !== seller.id)) {
    throw new HttpError(403, "Forbidden", "forbidden");
  }
  return ok(data);
});
