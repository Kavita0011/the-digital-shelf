import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { assertCanAssignRole, assertCanManageUser, HttpError, requireRole, requestIp } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { ROLES, type Role } from "@/lib/types";

const bodySchema = z.object({ role: z.enum(ROLES) });

/** Super admins manage roles; ordinary admins cannot promote or demote. */
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("super_admin");
  const id = parseUuidParam((await ctx.params).id);
  const { role } = bodySchema.parse(await req.json()) as { role: Role };

  const db = getSupabaseAdmin();
  const { data: target, error: targetError } = await db.from("users").select("id,role").eq("id", id).single();
  if (targetError) throw targetError;
  if (!target) throw new HttpError(404, "User not found", "not_found");

  const currentRole = target.role as Role;
  assertCanManageUser(admin, id, currentRole);
  assertCanAssignRole(admin, role);

  const { error } = await db.from("users").update({ role }).eq("id", id);
  if (error) throw error;
  await audit({
    actorId: admin.id,
    actorRole: admin.realRole,
    action: "user.role_changed",
    targetType: "user",
    targetId: id,
    metadata: { from: currentRole, to: role },
    ip: requestIp(req),
  });
  return ok({ id, role });
});
