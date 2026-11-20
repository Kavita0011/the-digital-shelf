import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { getCurrentUser, HttpError, requestIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  clearImpersonationCookie,
  IMPERSONABLE_ROLES,
  readImpersonationRole,
  setImpersonationCookie,
  type ImpersonableRole,
} from "@/lib/impersonation";

const bodySchema = z.object({ role: z.enum(IMPERSONABLE_ROLES) });

/** Use the real role here: an impersonating admin must still be able to exit. */
async function requireRealSuperAdmin() {
  const admin = await getCurrentUser({ ignoreImpersonation: true });
  if (!admin || admin.realRole !== "super_admin") {
    throw new HttpError(403, "Only super admins can use view-as mode", "forbidden");
  }
  return admin;
}

export const GET = route(async () => {
  const admin = await requireRealSuperAdmin();
  return ok({ role: await readImpersonationRole(admin.id) });
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const admin = await requireRealSuperAdmin();
  await rateLimit(`impersonate:${admin.id}`, 30, 15 * 60 * 1000);
  const { role } = bodySchema.parse(await req.json()) as { role: ImpersonableRole };
  await setImpersonationCookie(admin.id, role);
  await audit({
    actorId: admin.id,
    actorRole: admin.realRole,
    action: "admin.impersonate_start",
    targetType: "user",
    targetId: admin.id,
    metadata: { role },
    ip: requestIp(req),
  });
  return ok({ role });
});

export const DELETE = route(async (req: NextRequest) => {
  assertCsrf(req);
  const admin = await requireRealSuperAdmin();
  await clearImpersonationCookie();
  await audit({
    actorId: admin.id,
    actorRole: admin.realRole,
    action: "admin.impersonate_stop",
    targetType: "user",
    targetId: admin.id,
    ip: requestIp(req),
  });
  return ok({ role: null });
});
