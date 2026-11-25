import { parseUuidParam } from "@/lib/query";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, HttpError } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const id = parseUuidParam((await ctx.params).id);
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("id").eq("user_id", user.id).single();
  const { data: product } = await db.from("products").select("seller_id,status,file_id").eq("id", id).single();
  if (!product || !seller || product.seller_id !== seller.id) throw new HttpError(403, "Forbidden", "forbidden");
  if (!product.file_id) throw new HttpError(400, "Upload a product file before submitting", "file_required");
  const { data: file } = await db.from("product_files").select("scan_status").eq("id", product.file_id).single();
  if (file?.scan_status !== "clean") throw new HttpError(400, "File must pass malware scanning before submission", "scan_required");

  await db.from("products").update({ status: "pending_review" }).eq("id", id);
  await audit({ actorId: user.id, actorRole: user.role, action: "product.submitted", targetType: "product", targetId: id });
  return ok({ status: "pending_review" });
});
