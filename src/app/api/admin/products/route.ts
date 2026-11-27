import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { enumParam, parseUuidParam } from "@/lib/query";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CONTENT_TYPES, PRODUCT_STATUSES } from "@/lib/types";

/** Explicit admin projection: moderation needs seller + file scan context. */
const ADMIN_PRODUCT_COLUMNS =
  "id,title,slug,status,price,content_type,created_at,rejection_reason,file_id,is_featured,seller_id," +
  "seller_profiles(store_name),product_files!products_file_fk(scan_status,scan_provider,scan_analysis_id,scan_result,original_filename,uploaded_at)";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const url = new URL(req.url);
  const status = enumParam(url.searchParams.get("status"), PRODUCT_STATUSES, "product status");
  const seller = url.searchParams.get("seller");
  const category = url.searchParams.get("category");
  const contentType = enumParam(url.searchParams.get("contentType"), CONTENT_TYPES, "content type");
  let q = getSupabaseAdmin()
    .from("products")
    .select(ADMIN_PRODUCT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (seller) q = q.eq("seller_id", parseUuidParam(seller, "seller id"));
  if (category) q = q.eq("category_id", parseUuidParam(category, "category id"));
  if (contentType) q = q.eq("content_type", contentType);
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
