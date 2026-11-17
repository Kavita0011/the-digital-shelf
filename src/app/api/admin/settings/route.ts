import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  await requireRole("super_admin");
  const { data, error } = await getSupabaseAdmin().from("settings").select("*").order("key");
  if (error) throw error;
  return ok(data);
});

export const PATCH = route(async (req: NextRequest) => {
  assertCsrf(req);
  const admin = await requireRole("super_admin");
  const body = z.object({
    key: z.enum(["commission_rate_percent", "max_products_per_seller", "max_platform_products", "max_upload_bytes", "credit_expiry_days", "allow_repeat_downloads", "allow_credit_transfers", "tax_rate_percent"]),
    value: z.union([z.number(), z.boolean()]),
  }).parse(await req.json());
  await getSupabaseAdmin().from("settings").update({ value: body.value as never, updated_by: admin.id }).eq("key", body.key);
  await audit({ actorId: admin.id, actorRole: admin.role, action: "settings.changed", targetType: "setting", targetId: body.key, metadata: { value: body.value } });
  return ok({ key: body.key, value: body.value });
});
