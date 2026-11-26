import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CONTENT_TYPES } from "@/lib/types";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  category: z.string().uuid().optional(),
  contentType: z.enum(CONTENT_TYPES).optional(),
});

export const GET = route(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    contentType: url.searchParams.get("contentType") ?? undefined,
  });
  if (!parsed.success) throw new HttpError(400, "Invalid catalog filters", "invalid_query");
  const { page, limit, category, contentType } = parsed.data;
  const from = (page - 1) * limit;

  let query = getSupabaseAdmin()
    .from("products")
    .select("id,title,slug,short_description,price,currency,preview_image_url,category_id,content_type,is_featured,created_at", { count: "exact" })
    .eq("status", "approved")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  if (category) query = query.eq("category_id", category);
  if (contentType) query = query.eq("content_type", contentType);

  const { data, count, error } = await query;
  if (error) throw error;
  return ok({ products: data, total: count ?? 0, page, limit });
});
