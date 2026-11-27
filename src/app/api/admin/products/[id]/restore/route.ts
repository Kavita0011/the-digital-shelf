import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { transitionProduct } from "@/lib/admin-products";

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireRole("admin");
  const id = parseUuidParam((await ctx.params).id);
  const { data: product, error } = await getSupabaseAdmin()
    .from("products")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!product) throw new HttpError(404, "Product not found", "not_found");

  if (product.status === "rejected") {
    // Back to the seller: clear the reason and invalidate the stale scan.
    return ok(await transitionProduct(req, admin, id, "draft", null, { kind: "restore_to_draft" }));
  }
  if (product.status === "hidden" || product.status === "removed") {
    // Restore a previously live product (still requires a clean uploaded file).
    return ok(await transitionProduct(req, admin, id, "approved", null, { kind: "restore" }));
  }
  throw new HttpError(409, "This product cannot be restored in its current state", "invalid_transition");
});
