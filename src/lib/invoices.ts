import { isAdmin, HttpError } from "./auth";
import { getSupabaseAdmin } from "./admin-db";
import { parseUuidParam } from "./query";
import type { AuthenticatedUser } from "./types";

export interface InvoicePayment {
  method: string;
  amount: number;
  currency: string;
  creditsUsed: number;
  status: string;
  reference: string | null;
  receiptUrl: string | null;
  createdAt: string;
}

export interface InvoiceRefund {
  id: string;
  amount: number;
  status: string;
  reason: string;
  reference: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  status: string;
  issuedAt: string;
  paidAt: string | null;
  currency: string;
  buyer: { name: string; email: string };
  seller: { storeName: string; email: string };
  product: { title: string; slug: string; description: string; unitPrice: number };
  amounts: {
    subtotal: number;
    discount: number;
    creditsUsed: number;
    cardAmount: number;
    tax: number;
    totalPaid: number;
    commission: number;
    sellerEarnings: number;
  };
  payments: InvoicePayment[];
  refunds: InvoiceRefund[];
}

/**
 * Load one order as an invoice for a role-scoped viewer. Buyers only see their
 * own orders, sellers only see orders for their shop, and stored admin roles
 * can see all orders. Impersonation never changes stored permissions here.
 */
export async function loadInvoiceForUser(orderId: string, user: AuthenticatedUser): Promise<Invoice> {
  const id = parseUuidParam(orderId, "order id");
  const db = getSupabaseAdmin();

  const { data: order, error } = await db.from("orders")
    .select("id,order_number,created_at,paid_at,payment_status,buyer_id,seller_id,subtotal,discount,credits_used,card_amount,tax,total_paid,platform_commission,seller_earnings,products(title,slug,short_description,price,currency),seller_profiles(store_name,user_id),payments(payment_method,amount,currency,credits_used,status,stripe_payment_intent_id,receipt_url,created_at),refunds(id,amount,status,reason,stripe_refund_id,created_at)")
    .eq("id", id)
    .single();
  if (error) throw error;
  if (!order) throw new HttpError(404, "Invoice not found", "not_found");

  const sellerProfile = (
    Array.isArray(order.seller_profiles) ? order.seller_profiles[0] : order.seller_profiles
  ) as { store_name: string; user_id: string } | null;
  const isBuyer = order.buyer_id === user.id;
  const isSeller = sellerProfile?.user_id === user.id;
  if (!isBuyer && !isSeller && !isAdmin(user.realRole)) {
    throw new HttpError(404, "Invoice not found", "not_found");
  }

  const [buyerResult, sellerUserResult] = await Promise.all([
    db.from("users").select("full_name,email").eq("id", order.buyer_id).single(),
    sellerProfile
      ? db.from("users").select("full_name,email").eq("id", sellerProfile.user_id).single()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (buyerResult.error) throw buyerResult.error;
  if (sellerUserResult.error) throw sellerUserResult.error;

  const product = (order.products ?? {}) as {
    title?: string;
    slug?: string;
    short_description?: string;
    price?: number;
    currency?: string;
  };
  const payments = (order.payments ?? []) as Array<{
    payment_method: string;
    amount: number;
    currency: string;
    credits_used: number;
    status: string;
    stripe_payment_intent_id: string | null;
    receipt_url: string | null;
    created_at: string;
  }>;
  const refunds = (order.refunds ?? []) as Array<{
    id: string;
    amount: number;
    status: string;
    reason: string;
    stripe_refund_id: string | null;
    created_at: string;
  }>;

  return {
    id: String(order.id),
    number: String(order.order_number),
    status: String(order.payment_status),
    issuedAt: String(order.paid_at ?? order.created_at),
    paidAt: order.paid_at ? String(order.paid_at) : null,
    currency: String(product.currency ?? "usd").toUpperCase(),
    buyer: {
      name: String(buyerResult.data?.full_name ?? "Buyer"),
      email: String(buyerResult.data?.email ?? ""),
    },
    seller: {
      storeName: String(sellerProfile?.store_name ?? "The Digital Shelf seller"),
      email: String(sellerUserResult.data?.email ?? ""),
    },
    product: {
      title: String(product.title ?? "Digital product"),
      slug: String(product.slug ?? ""),
      description: String(product.short_description ?? ""),
      unitPrice: Number(product.price ?? order.subtotal ?? 0),
    },
    amounts: {
      subtotal: Number(order.subtotal ?? 0),
      discount: Number(order.discount ?? 0),
      creditsUsed: Number(order.credits_used ?? 0),
      cardAmount: Number(order.card_amount ?? 0),
      tax: Number(order.tax ?? 0),
      totalPaid: Number(order.total_paid ?? 0),
      commission: Number(order.platform_commission ?? 0),
      sellerEarnings: Number(order.seller_earnings ?? 0),
    },
    payments: payments.map((payment) => ({
      method: String(payment.payment_method),
      amount: Number(payment.amount),
      currency: String(payment.currency ?? "usd").toUpperCase(),
      creditsUsed: Number(payment.credits_used ?? 0),
      status: String(payment.status),
      reference: payment.stripe_payment_intent_id ? String(payment.stripe_payment_intent_id) : null,
      receiptUrl: payment.receipt_url ? String(payment.receipt_url) : null,
      createdAt: String(payment.created_at),
    })),
    refunds: refunds.map((refund) => ({
      id: String(refund.id),
      amount: Number(refund.amount),
      status: String(refund.status),
      reason: String(refund.reason),
      reference: refund.stripe_refund_id ? String(refund.stripe_refund_id) : null,
      createdAt: String(refund.created_at),
    })),
  };
}

export function formatInvoiceMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toLowerCase(),
  }).format(cents / 100);
}
