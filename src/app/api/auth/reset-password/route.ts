import type { NextRequest } from "next/server";
import { z } from "zod";
import { password } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { requestIp } from "@/lib/auth";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  rateLimit(`reset:${requestIp(req) ?? "unknown"}`, 5, 15 * 60 * 1000);
  const { newPassword } = z.object({ newPassword: password }).parse(await req.json());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
  return ok({ updated: true });
});
