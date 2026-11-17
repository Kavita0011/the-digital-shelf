import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, requestIp, HttpError } from "@/lib/auth";
import { rateLimit, rateLimitByIp } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";

const schema = z.object({
  items: z.array(z.object({ productId: z.string().uuid() })).min(1).max(20),
  creditsToUse: z.number().int().nonnegative().default(0),
  couponCode: z.string().max(40).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/** Only allow redirects back to our own origin (no client-controlled open redirects). */
function safeRedirect(candidate: string | undefined, fallback: string, appUrl: string): string {
  if (!candidate) return fallback;
  try {
    const target = new URL(candidate);
    if (target.origin === new URL(appUrl).origin) return target.toString();
  } catch {
    // fall through to the safe default
  }
  return fallback;
}

/** Split an integer amount across items, giving any rounding remainder to the last item. */
function allocate(total: number, prices: number[]): number[] {
  const sum = prices.reduce((a, b) => a + b, 0);
  if (sum <= 0) return prices.map(() => 0);
  const out = prices.map((p) => Math.round(total * p / sum));
  out[out.length - 1] = Math.max(0, total - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
}

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  rateLimit(`checkout:${user.id}`, 10, 10 * 60 * 1000);
  rateLimitByIp(requestIp(req), "checkout", 30, 10 * 60 * 1000);
  const body = schema.parse(await req.json());
  const db = getSupabaseAdmin();
  const env = getServerEnv();

  // NEVER trust client prices: reload everything from the database.
  const productIds = body.items.map((i) => i.productId);
  const { data: products } = await db.from("products")
    .select("id,title,price,currency,seller_id,status,seller_profiles(stripe_connect_account_id)")
    .in("id", productIds).eq("status", "approved");
  if (!products || products.length !== productIds.length) throw new HttpError(400, "One or more products are unavailable", "invalid_cart");
  if (new Set(products.map((p) => p.currency)).size !== 1) throw new HttpError(400, "Mixed currencies are not supported", "mixed_currency");

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
  const afterDiscount = Math.max(0, subtotal - discount);

  const { data: wallet } = await db.from("credit_wallets").select("balance").eq("user_id", user.id).single();
  const creditsUsed = Math.min(body.creditsToUse, afterDiscount, wallet?.balance ?? 0);
  const cardAmount = afterDiscount - creditsUsed;

  const { data: settings } = await db.from("settings").select("key,value");
  const setting = (key: string) => Number(settings?.find((s) => s.key === key)?.value ?? 0);
  const tax = Math.round(cardAmount * setting("tax_rate_percent") / 100);
  const totalCharge = cardAmount + tax;
  const commission = Math.round((subtotal - discount) * setting("commission_rate_percent") / 100);

  const customer = await getOrCreateStripeCustomer(user.id, user.email);
  const stripe = getStripe();
  const accounts = products
    .map((p) => p.seller_profiles?.[0]?.stripe_connect_account_id as string | undefined)
    .filter((value): value is string => Boolean(value));
  const uniqueAccounts = [...new Set(accounts)];
  const destination = uniqueAccounts.length === 1 ? uniqueAccounts[0] : env.STRIPE_PLATFORM_ACCOUNT_ID;
  const lines = products.map((p) => ({
    price_data: {
      currency: p.currency,
      product_data: { name: p.title },
      unit_amount: Number(p.price),
    },
    quantity: 1,
  }));
  if (discount > 0) {
    lines.push({ price_data: { currency: products[0].currency, product_data: { name: "Discount" }, unit_amount: -discount }, quantity: 1 });
  }
  if (tax > 0) {
    lines.push({ price_data: { currency: products[0].currency, product_data: { name: "Tax" }, unit_amount: tax }, quantity: 1 });
  }

  const successUrl = safeRedirect(body.successUrl, `${env.NEXT_PUBLIC_APP_URL}/buyer/purchases?status=success`, env.NEXT_PUBLIC_APP_URL);
  const cancelUrl = safeRedirect(body.cancelUrl, `${env.NEXT_PUBLIC_APP_URL}/cart?status=cancelled`, env.NEXT_PUBLIC_APP_URL);

  let checkout;
  if (totalCharge === 0 && creditsUsed > 0) {
    checkout = null; // fully credit-funded; no Stripe session needed
  } else {
    checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: lines,
      payment_intent_data: {
        application_fee_amount: commission,
        transfer_data: { destination },
        metadata: { platform: "digital_shelf" },
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { buyerId: user.id, creditsUsed: String(creditsUsed), discount: String(discount), productIds: productIds.join(","), orderIds: "" },
    });
  }

  // Persist pending orders with the *actual* discount/credit allocation so
  // ledgers and financial reports reconcile with Stripe.
  const discountShares = allocate(discount, prices);
  const creditShares = allocate(creditsUsed, prices);
  const taxShares = allocate(tax, prices);
  const orders = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const itemTotal = prices[i] - discountShares[i] - creditShares[i] + taxShares[i];
    const commissionCents = Math.round(prices[i] * setting("commission_rate_percent") / 100);
    const { data: order, error } = await db.from("orders").insert({
      buyer_id: user.id, seller_id: p.seller_id, product_id: p.id,
      order_number: `DS-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      subtotal: prices[i], discount: discountShares[i], credits_used: creditShares[i],
      card_amount: Math.max(0, prices[i] - discountShares[i] - creditShares[i]),
      tax: taxShares[i], total_paid: Math.max(0, itemTotal),
      platform_commission: commissionCents,
      seller_earnings: prices[i] - commissionCents,
      payment_status: "pending",
      stripe_checkout_session_id: checkout?.id ?? null,
    }).select().single();
    if (error) throw error;
    orders.push(order);
  }

  if (checkout) {
    await stripe.checkout.sessions.update(checkout.id, {
      metadata: { buyerId: user.id, creditsUsed: String(creditsUsed), discount: String(discount), productIds: productIds.join(","), orderIds: orders.map((o) => o.id).join(",") },
    });
  } else {
    // Debit credits BEFORE granting paid access. redeem_credits() locks the
    // wallet row and rejects overdrafts, so concurrent checkouts cannot both
    // spend the same credits.
    for (let i = 0; i < orders.length; i++) {
      if (creditShares[i] <= 0) continue;
      const { error: redeemError } = await db.rpc("redeem_credits", {
        p_user_id: user.id,
        p_amount: creditShares[i],
        p_order_id: orders[i].id,
        p_reason: "Credit-funded checkout",
      });
      if (redeemError) throw redeemError;
    }
    for (const order of orders) {
      const { error: paidError } = await db.from("orders")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", order.id);
      if (paidError) throw paidError;
    }
  }

  return ok({ checkoutUrl: checkout?.url ?? `${env.NEXT_PUBLIC_APP_URL}/buyer/purchases?status=credits`, orders });
});

async function getOrCreateStripeCustomer(userId: string, email: string) {
  const db = getSupabaseAdmin();
  const { data: profile } = await db.from("buyer_profiles").select("stripe_customer_id").eq("user_id", userId).single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;
  const customer = await getStripe().customers.create({ email, metadata: { user_id: userId } });
  await db.from("buyer_profiles").update({ stripe_customer_id: customer.id }).eq("user_id", userId);
  return customer.id;
}
