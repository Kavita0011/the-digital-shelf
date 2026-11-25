import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { deleteAccount } from "@/lib/account-controls";
import { assertCsrf } from "@/lib/csrf";
import { assertCanManageUser, HttpError, requireRole, requestIp } from "@/lib/auth";
import { parseUuidParam } from "@/lib/query";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const bodySchema = z.object({ confirm: z.literal("DELETE") });

/** Admin account deletion. Role hierarchy prevents peers/superiors from being deleted. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const id = parseUuidParam((await ctx.params).id);
  bodySchema.parse(await req.json());

  const { data: target, error } = await getSupabaseAdmin().from("users")
    .select("role,status")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!target) throw new HttpError(404, "User not found", "not_found");
  assertCanManageUser(admin, id, target.role as Role);

  await deleteAccount(id, {
    actorId: admin.id,
    actorRole: admin.realRole,
    ip: requestIp(req),
    self: false,
  });

  return ok({ id, deleted: true });
});
