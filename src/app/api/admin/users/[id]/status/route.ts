import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole, requestIp } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

/** Actions: suspend | ban | activate */
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { id } = await ctx.params;
  const status = req.nextUrl.pathname.endsWith("/ban") ? "banned" : req.nextUrl.pathname.endsWith("/suspend") ? "suspended" : "active";
  await getSupabaseAdmin().from("users").update({ status }).eq("id", id);
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `user.${status}`,
    targetType: "user", targetId: id, ip: requestIp(req),
  });
  return ok({ status });
});
