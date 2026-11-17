import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, requestIp, HttpError } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe, platformCommissionCents } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";

const schema = z.object({
  items: z.array(z.object({ productId: z.string().uuid() })).min(1).max(20),
  creditsToUse: z.number().int().nonnegative().default(0),
  couponCode: z.string().max(40).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

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

  const subtotal = products.reduce((sum, p) => sum + Number(p.price), 0);

  // Server-side coupon validation.
  let discount = 0;
  if (body.couponCode) {
    const { data: coupon } = await db.from("coupons")
      .select("percent_off,amount_off,active,max_uses,uses").ilike("code", body.couponCode).eq("active", true).single();
    if (coupon && ((coupon.max_uses ?? 0) === 0 || coupon.uses < coupon.max_uses)) {
      discount = coupon.amount_off > 0
        ? Math.min(subtotal, coupon.amount_off)
        : Math.round(subtotal * coupon.percent_off / 100);
    }
  }
  const afterDiscount = Math.max(0, subtotal - discount);

  // Server-side credit validation.
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
  // Destination account: single-seller carts route directly; multi-seller carts
  // require separate payment intents (documented limitation) and use platform
  // settlement with ledger entries per seller.
  const accounts = products.map((p: any) => p.seller_profiles?.stripe_connect_account_id).filter(Boolean) as string[];
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

  let checkout;
  if (totalCharge === 0 && creditsUsed > 0) {
    // Fully credit-funded order: no Stripe Checkout session needed.
    checkout = null;
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
      success_url: body.successUrl ?? `${env.NEXT_PUBLIC_APP_URL}/buyer/purchases?status=success`,
      cancel_url: body.cancelUrl ?? `${env.NEXT_PUBLIC_APP_URL}/cart?status=cancelled`,
      metadata: { buyerId: user.id, creditsUsed: String(creditsUsed), discount: String(discount), productIds: productIds.join(","), orderIds: "" },
    });
  }

  // Persist pending orders.
  const orders = [];
  for (const p of products) {
    const share = subtotal > 0 ? Number(p.price) / subtotal : 0;
    const orderTotal = Number(p.price) - Math.round(share * discount) - Math.round(share * creditsUsed);
    const { data: order } = await db.from("orders").insert({
      buyer_id: user.id, seller_id: p.seller_id, product_id: p.id,
      order_number: `DS-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      subtotal: Number(p.price), discount: 0, credits_used: 0,
      card_amount: Math.max(0, orderTotal), tax: 0, total_paid: Math.max(0, orderTotal),
      platform_commission: Math.round(Number(p.price) * setting("commission_rate_percent") / 100),
      seller_earnings: Number(p.price) - Math.round(Number(p.price) * setting("commission_rate_percent") / 100),
      payment_status: "pending",
      stripe_checkout_session_id: checkout?.id ?? null,
    }).select().single();
    orders.push(order);
  }

  if (checkout) {
    await stripe.checkout.sessions.update(checkout.id, {
      metadata: { buyerId: user.id, creditsUsed: String(creditsUsed), discount: String(discount), productIds: productIds.join(","), orderIds: orders.map((o) => o.id).join(",") },
    });
  } else {
    // Fully credit-funded: mark orders paid and record credit redemption now.
    for (const order of orders) {
      await db.from("orders").update({ payment_status: "paid", paid_at: new Date().toISOString() }).eq("id", order.id);
    }
    if (creditsUsed > 0) {
      const { rpc } = db;
      await rpc("redeem_credits", { p_user_id: user.id, p_amount: creditsUsed, p_order_id: orders[0].id, p_reason: "Credit-funded checkout" });
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

// Avoid a missing helper import used above.
function rateLimitByIp(ip: string | null, scope: string, limit: number, windowMs: number) {
  rateLimit(`${scope}:${ip ?? "unknown"}`, limit, windowMs);
}
