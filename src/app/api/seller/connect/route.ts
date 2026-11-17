import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { assertCsrf } from "@/lib/csrf";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createOnboardingLink, ensureConnectAccount } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  if (user.role !== "seller") throw new HttpError(403, "Sellers only", "forbidden");
  const db = getSupabaseAdmin();
  const { data: seller } = await db.from("seller_profiles").select("*").eq("user_id", user.id).single();
  if (!seller) throw new HttpError(404, "Seller profile not found", "not_found");
  if (seller.verification_status !== "approved") throw new HttpError(403, "Seller not approved", "seller_not_approved");

  const accountId = await ensureConnectAccount(seller as never, user.email);
  if (!seller.stripe_connect_account_id) {
    await db.from("seller_profiles").update({ stripe_connect_account_id: accountId, payout_status: "onboarding" }).eq("id", seller.id);
  }
  const env = getServerEnv();
  const url = await createOnboardingLink(
    accountId,
    `${env.NEXT_PUBLIC_APP_URL}/seller/payouts?status=complete`,
    `${env.NEXT_PUBLIC_APP_URL}/seller/payouts?status=refresh`,
  );
  return ok({ onboardingUrl: url });
});
