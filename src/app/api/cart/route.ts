import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const schema = z.object({ productId: z.string().uuid(), action: z.enum(["add", "remove"]) });

/** Server-side cart stored per user; prices are always recomputed at checkout. */
export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  const body = schema.parse(await req.json());
  const db = getSupabaseAdmin();
  // Upsert into a cart_items table would be ideal; this minimal implementation
  // stores the cart in a settings namespaced row through user metadata.
  const { data: profile } = await db.from("users").select("id").eq("id", user.id).single();
  if (!profile) throw new Error("User not found");
  await db.from("carts").upsert({ user_id: user.id, product_id: body.productId }, { onConflict: "user_id,product_id" });
  if (body.action === "remove") {
    await db.from("carts").delete().eq("user_id", user.id).eq("product_id", body.productId);
  }
  const { data: items } = await db.from("carts").select("product_id").eq("user_id", user.id);
  return ok({ items: items?.map((i) => i.product_id) ?? [] });
});
