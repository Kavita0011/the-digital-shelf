import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, requestIp, HttpError } from "@/lib/auth";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getServerEnv } from "@/lib/env";
import { allocate } from "@/lib/pricing";
import { addCreditTransaction } from "@/lib/credits";

/**
 * Product checkout is credit-only. Cards/Stripe are used only to buy credit
 * packs in /api/credits/purchase; they are never accepted for product orders.
 */
const schema = z.object({
  items: z.array(z.object({ productId: z.string().uuid() })).min(1).max(20),
  couponCode: z.string().max(40).optional(),
});

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  await rateLimit(`checkout:${user.id}`, 10, 10 * 60 * 1000);
  await rateLimitByIp(requestIp(req), "checkout", 30, 10 * 60 * 1000);
  const body = schema.parse(await req.json());
  const db = getSupabaseAdmin();
  const env = getServerEnv();

  // NEVER trust client prices: reload everything from the database.
  const productIds = body.items.map((i) => i.productId);
  const { data: products } = await db.from("products")
    .select("id,title,price,currency,seller_id,status")
    .in("id", productIds).eq("status", "approved");
  if (!products || products.length !== productIds.length) {
    throw new HttpError(400, "One or more products are unavailable", "invalid_cart");
  }
  if (new Set(products.map((p) => p.currency)).size !== 1) {
    throw new HttpError(400, "Mixed currencies are not supported", "mixed_currency");
  }
  const currency = products[0].currency;

  // Stored price integers are credits: 1 credit = $0.01.
  const prices = products.map((p) => Number(p.price));
  const subtotal = prices.reduce((sum, price) => sum + price, 0);

  // Atomic, case-insensitive single-use coupon redemption (DB row lock).
  let discount = 0;
  if (body.couponCode) {
    const { data: coupon, error: couponError } = await db.rpc("apply_coupon", { p_code: body.couponCode });
    if (couponError) throw couponError;
    const applied = Array.isArray(coupon) ? coupon[0] : null;
    if (applied) {
      discount = applied.amount_off > 0
        ? Math.min(subtotal, applied.amount_off)
        : Math.round(subtotal * applied.percent_off / 100);
    }
  }
  const totalCredits = Math.max(0, subtotal - discount);

  const { data: wallet, error: walletError } = await db.from("credit_wallets")
    .select("balance").eq("user_id", user.id).single();
  if (walletError) throw walletError;
  if (!wallet) throw new HttpError(404, "Credit wallet not found", "not_found");
  if (wallet.balance < totalCredits) {
    throw new HttpError(
      402,
      `You need ${totalCredits} credits for this order but only have ${wallet.balance}. Buy more credits to continue.`,
      "insufficient_credits",
    );
  }

  const { data: settings } = await db.from("settings").select("key,value");
  const commissionRate = Number(settings?.find((s) => s.key === "commission_rate_percent")?.value ?? 0);

  const discountShares = allocate(discount, prices);
  const effectivePrices = prices.map((price, i) => Math.max(0, price - discountShares[i]));

  const orders: Array<{ id: string; total_paid: number; credits_used: number }> = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const effective = effectivePrices[i];
    const commission = Math.round(effective * commissionRate / 100);
    const { data: order, error } = await db.from("orders").insert({
      buyer_id: user.id,
      seller_id: p.seller_id,
      product_id: p.id,
      order_number: `DS-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      subtotal: prices[i],
      discount: discountShares[i],
      credits_used: effective,
      card_amount: 0,
      tax: 0,
      total_paid: effective,
      platform_commission: commission,
      seller_earnings: effective - commission,
      payment_status: "pending",
      stripe_checkout_session_id: null,
      stripe_payment_intent_id: null,
    }).select("id,total_paid,credits_used").single();
    if (error) throw error;
    orders.push(order as { id: string; total_paid: number; credits_used: number });
  }

  // Debit credits BEFORE granting paid access. redeem_credits() locks the
  // wallet row and is idempotent per order, so retries cannot double-charge.
  const debits: Array<{ orderId: string; amount: number }> = [];
  try {
    for (let i = 0; i < orders.length; i++) {
      const amount = Number(orders[i].credits_used);
      if (amount <= 0) continue;
      const { error: redeemError } = await db.rpc("redeem_credits", {
        p_user_id: user.id,
        p_amount: amount,
        p_order_id: orders[i].id,
        p_reason: "Product purchase with credits",
      });
      if (redeemError) {
        if (/insufficient credits/i.test(redeemError.message)) {
          throw new HttpError(402, "Insufficient credits", "insufficient_credits");
        }
        throw redeemError;
      }
      debits.push({ orderId: orders[i].id, amount });
    }

    const paidAt = new Date().toISOString();
    for (const order of orders) {
      const { error: paidError } = await db.from("orders")
        .update({ payment_status: "paid", paid_at: paidAt })
        .eq("id", order.id);
      if (paidError) throw paidError;

      // A payments row makes credit spending visible in payment history and
      // fires the payment notification trigger alongside the credit trigger.
      const { error: paymentError } = await db.from("payments").insert({
        order_id: order.id,
        user_id: user.id,
        payment_method: "credits",
        amount: Number(order.total_paid),
        currency,
        credits_used: Number(order.credits_used),
        status: "succeeded",
      });
      if (paymentError) throw paymentError;
    }
  } catch (error) {
    // A rare concurrent spend can fail partway through. Reverse any debits we
    // already made and mark the orders failed so no paid access is granted.
    for (const debit of debits) {
      try {
        await addCreditTransaction({
          userId: user.id,
          amount: debit.amount,
          type: "reversal",
          orderId: debit.orderId,
          reason: "Checkout failed - credit debit reversed",
        });
      } catch (rollbackError) {
        console.error("Failed to reverse checkout credit debit", rollbackError);
      }
    }
    if (orders.length > 0) {
      await db.from("orders")
        .update({ payment_status: "failed" })
        .in("id", orders.map((o) => o.id));
    }
    throw error;
  }

  return ok({
    redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/buyer/purchases?status=credits`,
    orders,
  });
});
