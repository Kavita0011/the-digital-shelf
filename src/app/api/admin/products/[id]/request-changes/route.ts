import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { transitionProduct } from "@/lib/admin-products";

const bodySchema = z.object({ reason: z.string().trim().min(5).max(2000) });

export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireRole("admin");
  const { reason } = bodySchema.parse(await req.json());
  const id = parseUuidParam((await ctx.params).id);
  return ok(await transitionProduct(
    req,
    admin,
    id,
    "rejected",
    `Changes requested: ${reason}`,
    { kind: "changes_requested" },
  ));
});
