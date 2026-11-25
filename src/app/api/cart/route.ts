import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { HttpError, requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ productId: z.string().uuid(), action: z.enum(["add", "remove"]) });

/** Server-side cart stored per user; prices are always recomputed at checkout. */
export const GET = route(async () => {
  const user = await requireUser();
  const { data, error } = await getSupabaseAdmin()
    .from("carts")
    .select("product_id,added_at,products(id,title,slug,price,currency,status)")
    .eq("user_id", user.id)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return ok(data ?? []);
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  await rateLimit(`cart:${user.id}`, 60, 60 * 1000);
  const { productId, action } = schema.parse(await req.json());
  const db = getSupabaseAdmin();

  if (action === "add") {
    const { data: product, error: productError } = await db
      .from("products")
      .select("id,status")
      .eq("id", productId)
      .single();
    if (productError) throw productError;
    if (!product || product.status !== "approved") {
      throw new HttpError(404, "Product not found", "not_found");
    }
    const { error } = await db.from("carts").upsert(
      { user_id: user.id, product_id: productId },
      { onConflict: "user_id,product_id" },
    );
    if (error) throw error;
  } else {
    const { error } = await db.from("carts").delete()
      .eq("user_id", user.id)
      .eq("product_id", productId);
    if (error) throw error;
  }

  const { data: items, error } = await db.from("carts").select("product_id").eq("user_id", user.id);
  if (error) throw error;
  return ok({ items: items?.map((item) => item.product_id) ?? [] });
});
