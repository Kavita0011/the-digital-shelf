import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, requestIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

const schema = z.object({
  productId: z.string().uuid(),
  reason: z.enum(["copyright", "malware", "misleading", "quality", "other"]),
  details: z.string().min(10).max(5000),
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  rateLimit(`report:${user.id}`, 10, 60 * 60 * 1000);
  const body = schema.parse(await req.json());
  const { data, error } = await getSupabaseAdmin().from("product_reports").insert({
    product_id: body.productId, reporter_id: user.id, reason: body.reason, details: body.details,
  }).select().single();
  if (error) throw error;
  await audit({ actorId: user.id, actorRole: user.role, action: "report.created", targetType: "product", targetId: body.productId, ip: requestIp(req) });
  return ok(data, 201);
});
