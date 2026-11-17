import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { requireRole, requestIp } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin().from("product_reports")
    .select("*,products(title,slug),users!product_reports_reporter_id_fkey(email)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ok(data);
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  adminNotes: z.string().max(2000).optional(),
});

export const PATCH = route(async (req: NextRequest) => {
  const admin = await requireRole("admin");
  const body = updateSchema.parse(await req.json());
  const { data, error } = await getSupabaseAdmin().from("product_reports").update({
    status: body.status,
    admin_notes: body.adminNotes ?? null,
    resolved_at: body.status === "resolved" || body.status === "dismissed" ? new Date().toISOString() : null,
  }).eq("id", body.id).select().single();
  if (error) throw error;
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `report.${body.status}`,
    targetType: "product_report", targetId: body.id, ip: requestIp(req),
  });
  return ok(data);
});
