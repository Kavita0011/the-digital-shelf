import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError, requestIp } from "@/lib/auth";
import { issueDownloadUrl } from "@/lib/downloads";

export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser();
  if (user.role !== "buyer") throw new HttpError(403, "Buyers only", "forbidden");
  const { orderId } = await ctx.params;
  return ok(await issueDownloadUrl(orderId, user.id, requestIp(req), req.headers.get("user-agent")));
});
