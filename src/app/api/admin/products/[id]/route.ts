import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { deleteObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Permanent deletion: only for drafts/rejected/removed products; financial history stays. */
export const DELETE = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data: product } = await db.from("products").select("id,status,file_id").eq("id", id).single();
  if (!product) throw new HttpError(404, "Product not found", "not_found");
  if (!["draft", "rejected", "removed"].includes(product.status)) {
    throw new HttpError(409, "Hide or remove the product before permanent deletion", "invalid_state");
  }
  const { count } = await db.from("orders").select("id", { count: "exact", head: true }).eq("product_id", id);
  if ((count ?? 0) > 0) throw new HttpError(409, "Products with order history cannot be permanently deleted", "has_orders");

  if (product.file_id) {
    const { data: file } = await db.from("product_files").select("storage_path").eq("id", product.file_id).single();
    if (file) await deleteObject(String(file.storage_path));
  }
  await db.from("products").delete().eq("id", id);
  await audit({ actorId: admin.id, actorRole: admin.role, action: "product.deleted", targetType: "product", targetId: id });
  return ok({ deleted: true });
});
