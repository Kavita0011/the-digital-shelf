import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const url = new URL(req.url);
  let q = getSupabaseAdmin().from("orders")
    .select("id,order_number,buyer_id,seller_id,product_id,subtotal,discount,credits_used,total_paid,payment_status,created_at")
    .order("created_at", { ascending: false }).limit(500);
  const status = url.searchParams.get("status");
  if (status) q = q.eq("payment_status", status);
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
