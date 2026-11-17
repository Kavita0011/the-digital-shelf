import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const url = new URL(req.url);
  let q = getSupabaseAdmin().from("payments").select("*").order("created_at", { ascending: false }).limit(500);
  const status = url.searchParams.get("status");
  const userId = url.searchParams.get("userId");
  const orderId = url.searchParams.get("orderId");
  if (status) q = q.eq("status", status);
  if (userId) q = q.eq("user_id", userId);
  if (orderId) q = q.eq("order_id", orderId);
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
