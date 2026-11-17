import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Stripe } from "stripe";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { addCreditTransaction } from "@/lib/credits";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_RE.test(value);

/** Stripe webhook: raw body + signature verification, idempotent via webhook_events. */
export const POST = async (req: NextRequest) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try {
    const raw = await req.text();
    event = getStripe().webhooks.constructEvent(raw, signature, getServerEnv().STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  // Pre-check duplicates, but only record the event AFTER successful handling.
  // Recording it first permanently swallows failed events when Stripe retries.
  const { data: existing } = await db.from("webhook_events")
    .select("id").eq("stripe_event_id", event.id).maybeSingle();
  if (existing) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const pi =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent as { id?: string } | null)?.id ?? null;

        // Credit packs: trust only the verified amount, never metadata alone.
        if (session.metadata?.type === "credit_purchase") {
          if (session.payment_status !== "paid" || !pi) break;
          const userId = session.metadata.userId;
          const credits = Number(session.metadata.credits ?? 0);
          const amount = session.amount_total ?? 0;
          if (!isUuid(userId) || credits <= 0 || amount < credits) {
            console.error("Rejecting inconsistent credit purchase webhook", { event: event.id });
            break;
          }
          // Only credit the wallet once per payment intent, even if Stripe
          // redelivers this event after a partial processing failure.
          const { data: priorPayments } = await db.from("payments")
            .select("id").is("order_id", null)
            .eq("stripe_payment_intent_id", pi).limit(1);
          if (priorPayments?.length) break;

          const { data: payment, error: paymentError } = await db.from("payments").insert({
            user_id: userId,
            payment_method: "stripe_card",
            amount,
            currency: session.currency ?? "usd",
            status: "succeeded",
            stripe_payment_intent_id: pi,
          }).select().single();
          if (paymentError) throw paymentError;
          await addCreditTransaction({
            userId, amount: credits, type: "purchase", paymentId: payment.id,
            reason: "Purchased credit pack",
          });
          await audit({
            actorId: null, actorRole: "anonymous", action: "credits.purchased",
            targetType: "user", targetId: userId, metadata: { eventId: event.id, amount, credits },
          });
          break;
        }

        // Asynchronous methods fire completed with payment_status=unpaid;
        // fulfillment waits for async_payment_succeeded.
        if (session.payment_status !== "paid") break;
        const orderIds = (session.metadata?.orderIds ?? "").split(",").filter(isUuid);
        const buyerId = session.metadata?.buyerId;
        if (!isUuid(buyerId) || orderIds.length === 0) break;
        if (!pi) {
          console.error("Paid checkout is missing a payment intent", { event: event.id });
          break;
        }

        const { data: orders } = await db.from("orders")
          .select("id,buyer_id,credits_used,total_paid,payment_status")
          .in("id", orderIds);
        for (const order of orders ?? []) {
          if (order.payment_status === "paid") continue; // already fulfilled

          // Debit credits BEFORE granting paid access. If redemption fails, the
          // order stays pending so a Stripe retry can complete it; redeem_credits
          // is idempotent per order, so a repeated delivery never double-charges.
          if ((order.credits_used ?? 0) > 0) {
            const { error: redeemError } = await db.rpc("redeem_credits", {
              p_user_id: order.buyer_id ?? buyerId,
              p_amount: order.credits_used,
              p_order_id: order.id,
              p_reason: "Credits used at checkout",
            });
            if (redeemError) throw redeemError;
          }

          // A prior partial delivery may already have recorded this payment.
          const { data: existingPayments } = await db.from("payments")
            .select("id").eq("order_id", order.id)
            .eq("stripe_payment_intent_id", pi).limit(1);
          if (!existingPayments?.length) {
            const { error: paymentError } = await db.from("payments").insert({
              order_id: order.id,
              user_id: order.buyer_id ?? buyerId,
              payment_method: "stripe_card",
              amount: order.total_paid,
              currency: session.currency ?? "usd",
              credits_used: order.credits_used ?? 0,
              status: "succeeded",
              stripe_payment_intent_id: pi,
              receipt_url: (session as unknown as { receipt_url?: string }).receipt_url ?? null,
            });
            if (paymentError) throw paymentError;
          }

          const { error: paidError } = await db.from("orders").update({
            payment_status: "paid", paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi,
          }).eq("id", order.id);
          if (paidError) throw paidError;
        }
        await audit({
          actorId: null, actorRole: "anonymous", action: "payment.succeeded",
          targetType: "order", targetId: orderIds[0] ?? null,
          metadata: { eventId: event.id },
        });
        break;
      }
      case "checkout.session.expired":
      case "payment_intent.payment_failed": {
        const obj = event.data.object as { id: string; metadata?: Record<string, string> };
        const pi = event.type === "payment_intent.payment_failed" ? obj.id : null;
        const orderIds = (obj.metadata?.orderIds ?? "").split(",").filter(isUuid);
        for (const id of orderIds) {
          await db.from("orders").update({ payment_status: "failed" })
            .eq("id", id).eq("payment_status", "pending");
        }
        if (pi) await db.from("payments").update({ status: "failed" }).eq("stripe_payment_intent_id", pi);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.amount <= 0) break; // avoid dividing by zero below
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        const fullyRefunded = charge.amount_refunded >= charge.amount;
        const { data: orders } = await db.from("orders")
          .select("id,buyer_id,credits_used,total_paid")
          .eq("stripe_payment_intent_id", pi);
        const refundId = charge.refunds?.data?.[0]?.id ?? charge.id;
        for (const order of orders ?? []) {
          const amount = Math.max(1, Math.round(order.total_paid * charge.amount_refunded / charge.amount));
          const { data: recorded } = await db.from("refunds")
            .select("id,amount").eq("order_id", order.id).eq("status", "succeeded");
          const alreadyRecorded = (recorded ?? []).some((r) => Number(r.amount) >= amount);
          if (alreadyRecorded) continue; // admin refund already recorded this
          await db.from("orders").update({
            payment_status: fullyRefunded ? "refunded" : "partially_refunded",
          }).eq("id", order.id);
          await db.from("payments").update({
            status: fullyRefunded ? "refunded" : "partially_refunded",
          }).eq("stripe_payment_intent_id", pi);
          const { error: refundError } = await db.from("refunds").insert({
            order_id: order.id, amount, reason: "Stripe refund",
            status: "succeeded", stripe_refund_id: `${refundId}-${order.id}`,
          });
          if (refundError) throw refundError;
          if ((order.credits_used ?? 0) > 0) {
            await addCreditTransaction({
              userId: order.buyer_id, amount: order.credits_used, type: "refund",
              orderId: order.id, reason: "Credits restored after refund",
            });
          }
        }
        await audit({
          actorId: null, actorRole: "anonymous", action: "payment.refunded",
          targetType: "payment", targetId: pi,
          metadata: { eventId: event.id, amount: charge.amount_refunded, full: fullyRefunded },
        });
        break;
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi = typeof dispute.payment_intent === "string" ? dispute.payment_intent : null;
        const { data: order } = await db.from("orders").select("id").eq("stripe_payment_intent_id", pi).single();
        if (order) {
          await db.from("orders").update({ payment_status: "disputed" }).eq("id", order.id);
          await db.from("disputes").insert({
            order_id: order.id, stripe_dispute_id: dispute.id, amount: dispute.amount,
            status: dispute.status, reason: dispute.reason ?? null,
          });
        }
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await audit({
          actorId: null, actorRole: "anonymous", action: "payout.paid",
          targetType: "payout", targetId: payout.id, metadata: { amount: payout.amount },
        });
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("Webhook processing error", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  const { error: recordError } = await db.from("webhook_events").insert({
    stripe_event_id: event.id, event_type: event.type, payload: event as never,
  });
  if (recordError) {
    // A concurrent delivery already recorded it; work completed successfully.
    console.warn("Webhook event already recorded", recordError.message);
  }
  return NextResponse.json({ received: true });
};
