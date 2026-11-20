import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { assertCanManageUser, HttpError, requireRole, requestIp } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { ROLES, type Role } from "@/lib/types";

const bodySchema = z.object({ role: z.enum(ROLES) });

/** Super admins manage roles; ordinary admins cannot promote or demote. */
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("super_admin");
  const { id } = await ctx.params;
  const { role } = bodySchema.parse(await req.json()) as { role: Role };
  assertCanManageUser(admin, id, role);

  const db = getSupabaseAdmin();
  const { data: target } = await db.from("users").select("id,role").eq("id", id).single();
  if (!target) throw new HttpError(404, "User not found", "not_found");

  await db.from("users").update({ role }).eq("id", id);
  await audit({
    actorId: admin.id,
    actorRole: admin.realRole,
    action: "user.role_changed",
    targetType: "user",
    targetId: id,
    metadata: { from: target.role, to: role },
    ip: requestIp(req),
  });
  return ok({ id, role });
});
