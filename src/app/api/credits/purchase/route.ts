import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { assertCsrf } from "@/lib/csrf";
import { requireUser, requestIp } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";
import { getServerEnv } from "@/lib/env";

const PACKS: Record<string, number> = { small: 1000, medium: 5000, large: 10000 }; // cents

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  await rateLimit(`credit-buy:${user.id}`, 5, 10 * 60 * 1000);
  const { pack } = z.object({ pack: z.enum(["small", "medium", "large"]) }).parse(await req.json());
  const amount = PACKS[pack];
  const env = getServerEnv();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", product_data: { name: `${amount / 100} Digital Shelf Credits` }, unit_amount: amount }, quantity: 1 }],
    metadata: { type: "credit_purchase", userId: user.id, credits: String(amount), ip: requestIp(req) ?? "" },
    success_url: `${env.NEXT_PUBLIC_APP_URL}/buyer/credits?status=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/buyer/credits?status=cancelled`,
  });
  return ok({ checkoutUrl: session.url });
});
