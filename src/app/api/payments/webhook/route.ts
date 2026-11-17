import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { Stripe } from "stripe";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { addCreditTransaction } from "@/lib/credits";

export const runtime = "nodejs";

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
  const { error: dupe } = await db.from("webhook_events").insert({
    stripe_event_id: event.id, event_type: event.type, payload: event as never,
  });
  if (dupe) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.type === "credit_purchase" && session.metadata?.userId) {
          const credits = Number(session.metadata.credits ?? 0);
          await addCreditTransaction({
            userId: session.metadata.userId,
            amount: credits,
            type: "purchase",
            paymentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            reason: "Purchased credit pack",
          });
          break;
        }

        const orderIds = (session.metadata?.orderIds ?? "").split(",").filter(Boolean);
        const creditsUsed = Number(session.metadata?.creditsUsed ?? 0);
        const pi = typeof session.payment_intent === "string" ? session.payment_intent : null;
        for (const orderId of orderIds) {
          await db.from("orders").update({
            payment_status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: pi,
          }).eq("id", orderId);
          await db.from("payments").insert({
            order_id: orderId,
            user_id: session.metadata?.buyerId ?? null,
            payment_method: "stripe_card",
            amount: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            credits_used: creditsUsed,
            status: "succeeded",
            stripe_payment_intent_id: pi,
            receipt_url: (session as unknown as { receipt_url?: string }).receipt_url ?? null,
          });
        }
        if (creditsUsed > 0 && session.metadata?.buyerId) {
          await addCreditTransaction({
            userId: session.metadata.buyerId,
            amount: -creditsUsed,
            type: "purchase",
            orderId: orderIds[0] ?? null,
            reason: "Credits used at checkout",
          });
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
        const orderIds = (obj.metadata?.orderIds ?? "").split(",").filter(Boolean);
        for (const id of orderIds) await db.from("orders").update({ payment_status: "failed" }).eq("id", id);
        if (pi) await db.from("payments").update({ status: "failed" }).eq("stripe_payment_intent_id", pi);
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        await db.from("orders").update({ payment_status: "refunded" }).eq("stripe_payment_intent_id", pi);
        await audit({
          actorId: null, actorRole: "anonymous", action: "payment.refunded",
          targetType: "payment", targetId: pi, metadata: { eventId: event.id },
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
            order_id: order.id,
            stripe_dispute_id: dispute.id,
            amount: dispute.amount,
            status: dispute.status,
            reason: dispute.reason ?? null,
          });
        }
        break;
      }
      case "payout.paid": {
        const payout = event.data.object as Stripe.Payout;
        await audit({
          actorId: null, actorRole: "anonymous", action: "payout.paid",
          targetType: "payout", targetId: payout.id,
          metadata: { amount: payout.amount },
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
  return NextResponse.json({ received: true });
};
