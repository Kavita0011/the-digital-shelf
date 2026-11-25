import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { productDraftSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

function slugify(title: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
}

async function sellerIdFor(userId: string) {
  const { data } = await getSupabaseAdmin().from("seller_profiles").select("id,upload_limit,verification_status").eq("user_id", userId).single();
  if (!data) throw new HttpError(403, "Seller profile required", "seller_required");
  if (data.verification_status !== "approved") throw new HttpError(403, "Seller account not approved", "seller_not_approved");
  return data;
}

export const GET = route(async () => {
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const seller = await sellerIdFor(user.id);
  const { data, error } = await getSupabaseAdmin()
    .from("products")
    .select("id,title,slug,status,price,currency,file_format,file_size,created_at")
    .eq("seller_id", seller.id).order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  await rateLimit(`product-create:${user.id}`, 15, 60 * 60 * 1000);
  const body = productDraftSchema.parse(await req.json());
  const seller = await sellerIdFor(user.id);

  const [{ count, error: countError }, { data: setting, error: settingError }] = await Promise.all([
    getSupabaseAdmin().from("products").select("id", { count: "exact", head: true }).eq("seller_id", seller.id),
    getSupabaseAdmin().from("settings").select("value").eq("key", "max_products_per_seller").single(),
  ]);
  if (countError) throw countError;
  if (settingError && settingError.code !== "PGRST116") throw settingError;
  const max = Math.min(seller.upload_limit, Number(setting?.value ?? 25));
  if ((count ?? 0) >= max) throw new HttpError(403, "Product limit reached", "limit_reached");

  const { data: product, error } = await getSupabaseAdmin().from("products").insert({
    seller_id: seller.id,
    title: body.title,
    slug: slugify(body.title),
    description: body.description,
    short_description: body.shortDescription,
    category_id: body.categoryId ?? null,
    tags: body.tags,
    price: body.price,
    currency: body.currency,
    license_type: body.licenseType,
    preview_image_url: body.previewImageUrl ?? null,
    rejection_reason: `Refund/support policy: ${body.refundPolicy}`, // stored with draft; admin sees it
    status: "draft",
  }).select().single();
  if (error) throw error;

  await audit({ actorId: user.id, actorRole: user.role, action: "product.created", targetType: "product", targetId: product.id });
  return ok(product, 201);
});
