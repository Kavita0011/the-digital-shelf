import Stripe from "stripe";
import { getServerEnv } from "./env";

let stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (stripe) return stripe;
  const env = getServerEnv();
  stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripe;
}

/** Stripe Connect account for an approved seller. */
export async function ensureConnectAccount(seller: {
  id: string;
  user_id: string;
  stripe_connect_account_id: string | null;
  store_name: string;
}, email: string) {
  const stripe = getStripe();
  if (seller.stripe_connect_account_id) return seller.stripe_connect_account_id;
  const account = await stripe.accounts.create({
    type: "express",
    country: "US", // make configurable via settings for international sellers
    email,
    business_type: "individual",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { seller_profile_id: seller.id, user_id: seller.user_id },
  });
  return account.id;
}

export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

export function platformCommissionCents(subtotal: number, ratePercent: number): number {
  return Math.round(subtotal * ratePercent / 100);
}
