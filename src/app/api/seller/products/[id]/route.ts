import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { productDraftSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { canSellerEdit } from "@/lib/product-workflow";

type Ctx = { params: Promise<{ id: string }> };

async function assertOwnership(userId: string, productId: string) {
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", userId).single();
  const { data: product } = await db.from("products").select("id,status,seller_id,file_id").eq("id", productId).single();
  if (!product) throw new HttpError(404, "Product not found", "not_found");
  if (!seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");
  return product;
}

/** Empty preview URLs arrive from plain HTML inputs; normalise before zod. */
function normaliseBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const body = { ...(raw as Record<string, unknown>) };
  if (body.previewImageUrl === "" || body.previewImageUrl === null) delete body.previewImageUrl;
  return body;
}

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const id = parseUuidParam((await ctx.params).id);
  const product = await assertOwnership(user.id, id);
  if (!canSellerEdit(product.status)) {
    throw new HttpError(409, "Product is being scanned and cannot be edited yet", "invalid_state");
  }

  const body = productDraftSchema.parse(normaliseBody(await req.json()));
  const { data, error } = await getSupabaseAdmin().from("products").update({
    title: body.title,
    description: body.description,
    short_description: body.shortDescription,
    category_id: body.categoryId,
    content_type: body.contentType,
    tags: body.tags,
    price: body.price,
    currency: body.currency,
    license_type: body.licenseType,
    preview_image_url: body.previewImageUrl ?? null,
    // Refund/support policy is validated but deliberately NOT stored as a
    // rejection reason. Any metadata change invalidates the old scan: the
    // seller must upload a new file before resubmitting.
    status: "draft",
    rejection_reason: null,
    file_id: null,
    file_format: null,
    file_size: null,
    file_checksum: null,
  }).eq("id", id).select().single();
  if (error) throw error;
  await audit({
    actorId: user.id, actorRole: user.role, action: "product.updated",
    targetType: "product", targetId: id,
    metadata: { from: product.status, to: "draft", invalidatedFileId: product.file_id },
  });
  return ok(data);
});

/**
 * Seller deletion is a soft delete. Hard-deleting would break order, payment
 * and invoice history, so the product is simply removed from the shelf while
 * all financial records remain intact.
 */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const id = parseUuidParam((await ctx.params).id);
  const product = await assertOwnership(user.id, id);

  if (product.status !== "removed") {
    const { error } = await getSupabaseAdmin().from("products")
      .update({ status: "removed", rejection_reason: null })
      .eq("id", id);
    if (error) throw error;
    await audit({
      actorId: user.id,
      actorRole: user.role,
      action: "product.deleted",
      targetType: "product",
      targetId: id,
      metadata: { from: product.status, to: "removed", softDelete: true },
    });
  }

  return ok({ id, status: "removed" });
});
