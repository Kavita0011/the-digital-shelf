import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { assertCanManageUser, HttpError, requireRole, requestIp } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/types";

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { id } = await ctx.params;
  const db = getSupabaseAdmin();
  const { data: target } = await db.from("users").select("role").eq("id", id).single();
  if (!target) throw new HttpError(404, "User not found", "not_found");
  assertCanManageUser(admin, id, target.role as Role);
  const { error } = await db.from("users").update({ status: "suspended" }).eq("id", id);
  if (error) throw error;
  await audit({ actorId: admin.id, actorRole: admin.role, action: "user.suspended", targetType: "user", targetId: id, ip: requestIp(req) });
  return ok({ status: "suspended" });
});
