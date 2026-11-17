import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { id } = await ctx.params;
  const { status } = z.object({ status: z.enum(["pending", "approved", "rejected"]) }).parse(await req.json());
  await getSupabaseAdmin().from("seller_profiles").update({ verification_status: status }).eq("id", id);
  await audit({ actorId: admin.id, actorRole: admin.role, action: "seller.verification", targetType: "seller", targetId: id, metadata: { status } });
  return ok({ status });
});
