import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { patternParam } from "@/lib/query";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (req: NextRequest) => {
  await requireRole("admin");
  const action = patternParam(new URL(req.url).searchParams.get("action"), "action");
  let q = getSupabaseAdmin().from("audit_logs").select("*").order("created_at", { ascending: false }).limit(1000);
  if (action) q = q.eq("action", action);
  const { data, error } = await q;
  if (error) throw error;
  return ok(data);
});
