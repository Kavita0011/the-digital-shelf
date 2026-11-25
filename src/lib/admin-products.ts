import { getSupabaseAdmin } from "./supabase";
import type { AuthenticatedUser, ProductStatus } from "./types";
import { HttpError } from "./auth";
import { audit } from "./audit";
import type { NextRequest } from "next/server";
import { requestIp } from "./auth";

/** Shared moderator transition with validation + audit trail. */
export async function transitionProduct(
  req: NextRequest,
  admin: AuthenticatedUser,
  productId: string,
  status: ProductStatus,
  reason: string | null,
  extra: Record<string, unknown> = {},
) {
  const db = getSupabaseAdmin();
  const { data: product, error: productError } = await db
    .from("products")
    .select("id,status,title,file_id")
    .eq("id", productId)
    .single();
  if (productError) throw productError;
  if (!product) throw new HttpError(404, "Product not found", "not_found");

  const update: Record<string, unknown> = { status, ...extra };
  if (status === "approved") {
    update.approved_at = new Date().toISOString();
    update.approved_by = admin.id;
    update.rejection_reason = null;
    // Approval is a manual moderation decision. It may be applied to a fresh
    // submission or to a product being restored from hidden/removed/rejected,
    // but never to an already approved product.
    if (!["pending_review", "hidden", "removed", "rejected"].includes(product.status)) {
      throw new HttpError(409, "This product cannot be approved from its current state", "invalid_transition");
    }
    if (!product.file_id) {
      throw new HttpError(409, "Cannot approve a product without an uploaded file", "file_required");
    }
    const { data: file, error: fileError } = await db
      .from("product_files")
      .select("scan_status")
      .eq("id", product.file_id)
      .single();
    if (fileError) throw fileError;
    if (!file) throw new HttpError(409, "The uploaded file for this product was not found", "file_not_found");
    if (file.scan_status !== "clean") {
      throw new HttpError(409, "Cannot approve a product that failed malware scanning", "scan_not_clean");
    }
  }
  if (status === "rejected") {
    if (!reason) throw new HttpError(400, "Rejection reason is required", "reason_required");
    update.rejection_reason = reason;
  }

  const { data, error } = await db.from("products").update(update).eq("id", productId).select().single();
  if (error) throw error;
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `product.${status}`,
    targetType: "product", targetId: productId,
    metadata: { from: product.status, to: status, reason, ...extra },
    ip: requestIp(req), userAgent: req.headers.get("user-agent"),
  });
  return data;
}
