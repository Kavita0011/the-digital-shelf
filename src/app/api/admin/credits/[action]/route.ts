import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole, requestIp } from "@/lib/auth";
import { addCreditTransaction, creditsExpiryDate } from "@/lib/credits";
import type { CreditTransactionType } from "@/lib/types";
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

  const map: Record<string, { signed: number; type: CreditTransactionType; status?: "frozen" }> = {
    grant: { signed: 1, type: "admin_grant" },
    deduct: { signed: -1, type: "admin_deduction" },
    freeze: { signed: 0, type: "admin_grant", status: "frozen" },
    reverse: { signed: -1, type: "reversal" },
  };
  const cfg = map[action];
  if (!cfg) throw new Error("Unknown credit action");

  const tx = await addCreditTransaction({
    userId: body.userId,
    amount: body.amount * cfg.signed,
    type: cfg.type,
    adminId: admin.id,
    reason: `${action}: ${body.reason}`,
    expiresAt: body.setExpiry ? creditsExpiryDate() : null,
    status: cfg.status,
  });
  await audit({
    actorId: admin.id, actorRole: admin.role, action: `credits.${action}`,
    targetType: "user", targetId: body.userId,
    metadata: { amount: body.amount, reason: body.reason, transactionId: tx.id },
    ip: requestIp(req),
  });
  return ok(tx, 201);
});
