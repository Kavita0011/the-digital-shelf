import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole } from "@/lib/auth";
import { transitionProduct } from "@/lib/admin-products";

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { reason } = z.object({ reason: z.string().min(5).max(2000) }).parse(await req.json());
  const { id } = await ctx.params;
  return ok(await transitionProduct(req, admin, id, "rejected", reason));
});
