import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireRole, requestIp, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { addCreditTransaction } from "@/lib/credits";
import { audit } from "@/lib/audit";

const schema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().int().positive().optional(),
  reason: z.string().min(5).max(1000),
  restoreCredits: z.boolean().default(true),
});

export const GET = route(async () => {
  await requireRole("admin");
  const { data, error } = await getSupabaseAdmin().from("refunds")
    .select("id,order_id,payment_id,amount,reason,status,stripe_refund_id,created_at")
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return ok(data);
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const admin = await requireRole("admin");
  const body = schema.parse(await req.json());
  const db = getSupabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", body.orderId).single();
  if (!order) throw new HttpError(404, "Order not found", "not_found");
  if (!["paid", "partially_refunded"].includes(String(order.payment_status))) {
    throw new HttpError(409, "Order is not refundable", "not_refundable");
  }

  // Prevent repeat refunds beyond the amount actually still outstanding.
  const { data: priorRefunds } = await db.from("refunds")
    .select("amount").eq("order_id", order.id).eq("status", "succeeded");
  const alreadyRefunded = (priorRefunds ?? []).reduce((sum, r) => sum + Number(r.amount), 0);
  const remaining = Math.max(0, Number(order.total_paid) - alreadyRefunded);
  const amount = body.amount ?? remaining;
  if (amount <= 0 || amount > remaining) {
    throw new HttpError(400, "Refund exceeds the outstanding order amount", "invalid_amount");
  }

  let stripeRefundId: string | null = null;
  if (order.stripe_payment_intent_id) {
    const refund = await getStripe().refunds.create({
      payment_intent: order.stripe_payment_intent_id,
      amount,
      reason: "requested_by_customer",
      metadata: { order_id: order.id, admin_id: admin.id },
    }, { idempotencyKey: `order-refund-${order.id}-${alreadyRefunded}-${amount}` });
    stripeRefundId = refund.id;
  }

  const { error: refundError } = await db.from("refunds").insert({
    order_id: order.id, amount, reason: body.reason,
    status: "succeeded", stripe_refund_id: stripeRefundId, admin_id: admin.id,
  });
  if (refundError) throw refundError;

  const fullyRefunded = remaining - amount === 0;
  const { error: orderError } = await db.from("orders").update({
    payment_status: fullyRefunded ? "refunded" : "partially_refunded",
    total_paid: remaining - amount,
  }).eq("id", order.id);
  if (orderError) throw orderError;

  if (body.restoreCredits && order.credits_used > 0) {
    await addCreditTransaction({
      userId: order.buyer_id, amount: Number(order.credits_used), type: "refund",
      orderId: order.id, adminId: admin.id, reason: `Refund restored credits: ${body.reason}`,
    });
  }
  await audit({
    actorId: admin.id, actorRole: admin.role, action: "refund.created",
    targetType: "order", targetId: order.id,
    metadata: { amount, reason: body.reason, stripeRefundId }, ip: requestIp(req),
  });
  return ok({ refunded: amount, stripeRefundId }, 201);
});
