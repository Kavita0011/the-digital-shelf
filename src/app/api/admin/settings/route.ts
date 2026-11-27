import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

/**
 * Only settings that runtime code actually reads are editable here. Other
 * rows in `settings` (max_platform_products, max_upload_bytes,
 * credit_expiry_days, allow_credit_transfers) are left untouched because no
 * caller consumes them yet; wiring them is a separate change.
 */
const RUNTIME_SETTING_KEYS = [
  "commission_rate_percent",
  "tax_rate_percent",
  "max_products_per_seller",
  "allow_repeat_downloads",
] as const;

/** Bounds for all numeric settings keys, including ones not yet editable. */
const NUMERIC_BOUNDS: Record<string, { min: number; max: number }> = {
  commission_rate_percent: { min: 0, max: 100 },
  tax_rate_percent: { min: 0, max: 100 },
  max_upload_bytes: { min: 1024 * 1024, max: 100 * 1024 * 1024 },
  max_products_per_seller: { min: 1, max: 1_000_000 },
  max_platform_products: { min: 1, max: 1_000_000 },
  credit_expiry_days: { min: 1, max: 3650 },
};

const INTEGER_SETTING_KEYS = new Set([
  "max_upload_bytes",
  "max_products_per_seller",
  "max_platform_products",
  "credit_expiry_days",
]);

const bodySchema = z.object({
  key: z.enum(RUNTIME_SETTING_KEYS),
  value: z.union([z.number(), z.boolean()]),
}).superRefine(({ key, value }, ctx) => {
  if (key === "allow_repeat_downloads") {
    if (typeof value !== "boolean") {
      ctx.addIssue({ code: "custom", message: "allow_repeat_downloads must be a boolean" });
    }
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    ctx.addIssue({ code: "custom", message: `${key} must be a finite number` });
    return;
  }
  const { min, max } = NUMERIC_BOUNDS[key];
  const wholeNumber = INTEGER_SETTING_KEYS.has(key);
  if ((wholeNumber && !Number.isInteger(value)) || value < min || value > max) {
    ctx.addIssue({
      code: "custom",
      message: `${key} must be ${wholeNumber ? "a whole number " : ""}between ${min} and ${max}`,
    });
  }
});

export const GET = route(async () => {
  await requireRole("super_admin");
  const { data, error } = await getSupabaseAdmin().from("settings").select("*").order("key");
  if (error) throw error;
  return ok(data);
});

export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireRole("super_admin");
  const body = bodySchema.parse(await req.json());
  const { error } = await getSupabaseAdmin().from("settings")
    .update({ value: body.value as never, updated_by: admin.id })
    .eq("key", body.key);
  if (error) throw error;
  await audit({
    actorId: admin.id,
    actorRole: admin.role,
    action: "settings.changed",
    targetType: "setting",
    targetId: body.key,
    metadata: { value: body.value },
  });
  return ok({ key: body.key, value: body.value });
});
