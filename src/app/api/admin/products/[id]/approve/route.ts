import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole } from "@/lib/auth";
import { transitionProduct } from "@/lib/admin-products";

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const id = parseUuidParam((await ctx.params).id);
  return ok(await transitionProduct(req, admin, id, "approved", null));
});
