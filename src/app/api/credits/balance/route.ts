import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async () => {
  const user = await requireUser();
  const db = getSupabaseAdmin();
  const { data: wallet } = await db.from("credit_wallets").select("balance,pending_balance,frozen_balance,currency").eq("user_id", user.id).single();
  const { data: expired } = await db.from("credit_transactions").select("amount").eq("user_id", user.id).eq("status", "expired");
  const expiredTotal = (expired ?? []).reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  return ok({ ...wallet, expired_credits: expiredTotal });
});
