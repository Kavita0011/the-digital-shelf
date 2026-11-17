import type { NextRequest } from "next/server";
import { z } from "zod";
import { email } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { requestIp } from "@/lib/auth";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  rateLimit(`forgot:${requestIp(req) ?? "unknown"}`, 5, 15 * 60 * 1000);
  const body = z.object({ email, redirectTo: z.string().url().optional() }).parse(await req.json());
  const supabase = await createSupabaseServerClient();
  // Always return success to avoid account enumeration.
  await supabase.auth.resetPasswordForEmail(body.email, {
    redirectTo: body.redirectTo ?? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  return ok({ sent: true });
});
