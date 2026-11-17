import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req); const admin = await requireRole("admin"); const { id } = await ctx.params;
  const { featured } = z.object({ featured: z.boolean() }).parse(await req.json());
  await getSupabaseAdmin().from("products").update({ is_featured: featured }).eq("id", id);
  await audit({ actorId: admin.id, actorRole: admin.role, action: "product.feature", targetType: "product", targetId: id, metadata: { featured } });
  return ok({ featured });
});
