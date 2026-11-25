import type { NextRequest } from "next/server";
import { z } from "zod";
import { password } from "@/lib/validation";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { rateLimitByIp } from "@/lib/rate-limit";
import { assertCsrf, csrfCookieOptions } from "@/lib/csrf";
import { requestIp, HttpError } from "@/lib/auth";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  await rateLimitByIp(requestIp(req), "reset", 5, 15 * 60 * 1000);
  const { tokenHash, newPassword } = z.object({
    tokenHash: z.string().min(10).max(500),
    newPassword: password,
  }).parse(await req.json());

  const supabase = await createSupabaseServerClient();
  // The emailed recovery token is the only proof of ownership. A plain logged-in
  // session is not sufficient to change a password.
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
  if (verifyError) throw new HttpError(400, "Invalid or expired reset link", "invalid_reset_token");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new HttpError(400, error.message, "password_update_failed");

  // A password reset must invalidate sessions created with the old password.
  // Supabase's admin sign-out revokes all refresh tokens for the user.
  const { data: { session } } = await supabase.auth.getSession();
  let sessionsRevoked = false;
  if (session?.access_token) {
    const { error: revokeError } = await getSupabaseAdmin().auth.admin.signOut(session.access_token);
    sessionsRevoked = !revokeError;
    if (revokeError) console.error("Could not revoke sessions after password reset", revokeError);
  }

  const response = ok({ updated: true, sessionsRevoked });
  const csrf = csrfCookieOptions();
  response.cookies.set(csrf.name, csrf.value, csrf.options);
  return response;
});
