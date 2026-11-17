import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const url = new URL(req.url);
  let q = getSupabaseAdmin().from("products").select("*").order("created_at", { ascending: false }).limit(200);
  const status = url.searchParams.get("status");
  const seller = url.searchParams.get("seller");
  const category = url.searchParams.get("category");
  if (status) q = q.eq("status", status);
  if (seller) q = q.eq("seller_id", seller);
  if (category) q = q.eq("category_id", category);
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
