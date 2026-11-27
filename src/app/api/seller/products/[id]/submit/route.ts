import { parseUuidParam } from "@/lib/query";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const id = parseUuidParam((await ctx.params).id);
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  const { data: product } = await db
    .from("products")
    .select("seller_id,status,file_id,rejection_reason")
    .eq("id", id)
    .single();
  if (!product || !seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");

  // Only a pre-review product can be submitted. A rejected product keeps its
  // previous (clean) file linked; the seller must edit it (PATCH clears the
  // file and the reason) and upload + scan a new file before resubmitting.
  // `scanning`/`pending_review` are the transient states set by the upload
  // pipeline once a fresh file has passed its scan.
  if (!["draft", "scanning", "pending_review"].includes(product.status)) {
    throw new HttpError(
      409,
      product.status === "rejected"
        ? "Edit the product and upload a new file before resubmitting"
        : "Product cannot be submitted in its current state",
      "invalid_state",
    );
  }
  if (!product.file_id) throw new HttpError(400, "Upload a product file before submitting", "file_required");

  // The file must be linked to THIS product, not merely exist with a clean scan.
  const { data: file, error: fileError } = await db
    .from("product_files")
    .select("id,product_id,scan_status")
    .eq("id", product.file_id)
    .eq("product_id", id)
    .single();
  if (fileError) throw fileError;
  if (!file) throw new HttpError(400, "The uploaded file for this product was not found", "file_required");
  if (file.scan_status !== "clean") {
    throw new HttpError(400, "File must pass malware scanning before submission", "scan_required");
  }

  const { error } = await db
    .from("products")
    .update({ status: "pending_review", rejection_reason: null })
    .eq("id", id);
  if (error) throw error;
  await audit({
    actorId: user.id, actorRole: user.role, action: "product.submitted",
    targetType: "product", targetId: id,
    metadata: { fileId: file.id, from: product.status },
  });
  return ok({ status: "pending_review" });
});
