import { parseUuidParam } from "@/lib/query";
import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError, requestIp } from "@/lib/auth";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { issueDownloadUrl } from "@/lib/downloads";

export const GET = route(async (req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) => {
  const user = await requireUser();
  await rateLimit(`download:${user.id}`, 30, 15 * 60 * 1000);
  await rateLimitByIp(requestIp(req), "download", 90, 15 * 60 * 1000);
  if (user.role !== "buyer") throw new HttpError(403, "Buyers only", "forbidden");
  const orderId = parseUuidParam((await ctx.params).orderId, "order id");
  return ok(await issueDownloadUrl(orderId, user.id, requestIp(req), req.headers.get("user-agent")));
});
