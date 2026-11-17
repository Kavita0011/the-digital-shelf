import { getSupabaseAdmin } from "./supabase";
import type { AuditContext } from "./types";

/** Append-only audit record. Never throws: auditing must not break the action. */
export async function audit(ctx: AuditContext): Promise<void> {
  try {
    await getSupabaseAdmin().from("audit_logs").insert({
      actor_id: ctx.actorId,
      actor_role: ctx.actorRole,
      action: ctx.action,
      target_type: ctx.targetType,
      target_id: ctx.targetId,
      metadata: ctx.metadata ?? {},
      ip_address: ctx.ip || null,
      user_agent: ctx.userAgent || null,
    });
  } catch (error) {
    console.error("audit_log write failed", error);
  }
}
