import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { enumParam, parseUuidParam } from "@/lib/query";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PAYMENT_STATUSES } from "@/lib/types";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const url = new URL(req.url);
  const status = enumParam(url.searchParams.get("status"), PAYMENT_STATUSES, "payment status");
  const userId = url.searchParams.get("userId");
  const orderId = url.searchParams.get("orderId");
  let q = getSupabaseAdmin().from("payments").select("*").order("created_at", { ascending: false }).limit(500);
  if (status) q = q.eq("status", status);
  if (userId) q = q.eq("user_id", parseUuidParam(userId, "user id"));
  if (orderId) q = q.eq("order_id", parseUuidParam(orderId, "order id"));
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
