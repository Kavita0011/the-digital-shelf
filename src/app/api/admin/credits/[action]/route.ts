import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { assertCanManageUser, HttpError, requireRole, requestIp } from "@/lib/auth";
import { addCreditTransaction, creditsExpiryDate } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CreditTransactionType, Role } from "@/lib/types";
import { audit } from "@/lib/audit";

const schema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().min(5).max(1000),
  setExpiry: z.boolean().optional(),
});

/** Actions: grant | deduct | freeze | reverse */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ action: string }> }) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const { action } = await ctx.params;
  const body = schema.parse(await req.json());

  const map: Record<string, { signed: number; type: CreditTransactionType }> = {
    grant: { signed: 1, type: "admin_grant" },
    deduct: { signed: -1, type: "admin_deduction" },
    reverse: { signed: -1, type: "reversal" },
  };
  const cfg = map[action];
  if (!cfg && action !== "freeze") throw new HttpError(400, "Unknown credit action", "invalid_action");

  const db = getSupabaseAdmin();
  const { data: target } = await db.from("users").select("role").eq("id", body.userId).single();
  if (!target) throw new HttpError(404, "User not found", "not_found");
  // No self-grants and no adjustments to peers or superiors.
  assertCanManageUser(admin, body.userId, target.role as Role);

  let txId: string;
  if (action === "freeze") {
    const { error } = await db.rpc("freeze_credits", { p_user_id: body.userId, p_amount: body.amount });
    if (error) throw error;
    const { data: frozen } = await db.from("credit_transactions")
      .select("id").eq("user_id", body.userId).eq("status", "frozen")
      .order("created_at", { ascending: false }).limit(1).single();
    txId = frozen?.id ?? "unknown";
  } else {
    const tx = await addCreditTransaction({
      userId: body.userId,
      amount: body.amount * cfg!.signed,
      type: cfg!.type,
      adminId: admin.id,
      reason: `${action}: ${body.reason}`,
      expiresAt: body.setExpiry ? creditsExpiryDate() : null,
    });
    txId = tx.id;
  }
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `credits.${action}`,
    targetType: "user", targetId: body.userId,
    metadata: { amount: body.amount, reason: body.reason, transactionId: txId },
    ip: requestIp(req),
  });
  return ok({ transactionId: txId }, 201);
});
