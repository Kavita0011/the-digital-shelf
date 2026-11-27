import { getSupabaseAdmin } from "./supabase";
import type { AuthenticatedUser, ProductStatus } from "./types";
import { HttpError, requestIp } from "./auth";
import { audit } from "./audit";
import type { NextRequest } from "next/server";

/**
 * Shared moderator transition with validation + audit trail.
 * `metadata` is audit-only; it is never written to the products table.
 */
export async function transitionProduct(
  req: NextRequest,
  admin: AuthenticatedUser,
  productId: string,
  status: ProductStatus,
  reason: string | null,
  metadata: Record<string, unknown> = {},
) {
  const db = getSupabaseAdmin();
  const { data: product, error: productError } = await db
    .from("products")
    .select("id,status,title,file_id")
    .eq("id", productId)
    .single();
  if (productError) throw productError;
  if (!product) throw new HttpError(404, "Product not found", "not_found");

  const update: Record<string, unknown> = { status };
  if (status === "approved") {
    update.approved_at = new Date().toISOString();
    update.approved_by = admin.id;
    update.rejection_reason = null;
    // Approval is a manual moderation decision for a fresh submission or a
    // restore from hidden/removed. Rejected products go back to the seller as
    // a draft (see the restore route) so they must upload a new file first.
    if (!["pending_review", "hidden", "removed"].includes(product.status)) {
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
  if (status === "draft") {
    // Returning a rejected product to the seller invalidates the old scan so
    // the seller cannot resubmit it without a fresh upload.
    if (product.status !== "rejected") {
      throw new HttpError(409, "Only a rejected product can be returned to draft", "invalid_transition");
    }
    update.rejection_reason = null;
    update.file_id = null;
    update.file_format = null;
    update.file_size = null;
    update.file_checksum = null;
    update.approved_at = null;
    update.approved_by = null;
  }

  const { data, error } = await db.from("products").update(update).eq("id", productId).select().single();
  if (error) throw error;
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `product.${status}`,
    targetType: "product", targetId: productId,
    metadata: { from: product.status, to: status, reason, ...metadata },
    ip: requestIp(req), userAgent: req.headers.get("user-agent"),
  });
  return data;
}
