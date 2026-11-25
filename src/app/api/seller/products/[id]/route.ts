import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { productDraftSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

async function assertOwnership(userId: string, productId: string) {
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", userId).single();
  const { data: product } = await db.from("products").select("id,status,seller_id").eq("id", productId).single();
  if (!product) throw new HttpError(404, "Product not found", "not_found");
  if (!seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");
  return product;
}

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const id = parseUuidParam((await ctx.params).id);
  const product = await assertOwnership(user.id, id);
  if (!["draft", "rejected"].includes(product.status)) throw new HttpError(409, "Product cannot be edited in this state", "invalid_state");

  const body = productDraftSchema.parse(await req.json());
  const { data, error } = await getSupabaseAdmin().from("products").update({
    title: body.title,
    description: body.description,
    short_description: body.shortDescription,
    category_id: body.categoryId ?? null,
    tags: body.tags,
    price: body.price,
    currency: body.currency,
    license_type: body.licenseType,
    preview_image_url: body.previewImageUrl ?? null,
    rejection_reason: `Refund/support policy: ${body.refundPolicy}`,
    status: "draft", // resubmission requires new upload + scan
  }).eq("id", id).select().single();
  if (error) throw error;
  await audit({ actorId: user.id, actorRole: user.role, action: "product.updated", targetType: "product", targetId: id });
  return ok(data);
});
