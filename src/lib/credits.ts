import { getSupabaseAdmin } from "./supabase";
import { HttpError } from "./auth";
import type { CreditTransactionType } from "./types";

/**
 * Append a credit transaction and let the DB trigger move the wallet balance.
 * Checkout spends go through the `redeem_credits` RPC, which records a
 * `spend` type (migration 0010) under a wallet row lock. `purchase` means
 * buying credits and must not be reused for debits.
 */
export async function addCreditTransaction(params: {
  userId: string;
  amount: number; // signed, in credit units (1 credit = $0.01)
  type: CreditTransactionType;
  adminId?: string | null;
  orderId?: string | null;
  paymentId?: string | null;
  reason: string;
  expiresAt?: string | null;
  status?: "completed" | "pending" | "frozen";
}) {
  const db = getSupabaseAdmin();
  const { data: wallet } = await db.from("credit_wallets").select("id").eq("user_id", params.userId).single();
  if (!wallet) throw new HttpError(404, "Wallet not found", "not_found");

  const { data, error } = await db.from("credit_transactions").insert({
    wallet_id: wallet.id,
    user_id: params.userId,
    amount: params.amount,
    transaction_type: params.type,
    admin_id: params.adminId ?? null,
    related_order_id: params.orderId ?? null,
    related_payment_id: params.paymentId ?? null,
    reason: params.reason,
    expires_at: params.expiresAt ?? null,
    status: params.status ?? "completed",
  }).select().single();
  if (error) {
    if (error.message.includes("Insufficient credits")) throw new HttpError(400, "Insufficient credits", "insufficient_credits");
    throw error;
  }
  return data;
}

export function creditsExpiryDate(): string | null {
  const days = Number(process.env.CREDIT_EXPIRY_DAYS ?? 365);
  return days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
}
