import type { NextRequest } from "next/server";
import { z } from "zod";
import { email } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { rateLimitByIp } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { requestIp } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  await rateLimitByIp(requestIp(req), "forgot", 5, 15 * 60 * 1000);
  const body = z.object({ email, redirectTo: z.string().url().optional() }).parse(await req.json());
  const appUrl = getServerEnv().NEXT_PUBLIC_APP_URL;
  let redirectTo = `${appUrl}/reset-password`;
  if (body.redirectTo) {
    const target = new URL(body.redirectTo);
    if (target.origin === new URL(appUrl).origin) redirectTo = target.toString();
  }
  const supabase = await createSupabaseServerClient();
  // Always return success to avoid account enumeration.
  await supabase.auth.resetPasswordForEmail(body.email, { redirectTo });
  return ok({ sent: true });
});
