import type { NextRequest } from "next/server";
import { ok, route } from "@/lib/api";
import { HttpError } from "@/lib/auth";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/types";

/**
 * Send another Supabase signup confirmation link. The recipient is always the
 * signed-in Supabase user, never an address supplied by the client.
 */
export const POST = route(async (req: NextRequest) => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) throw new HttpError(401, "Sign in first to resend confirmation", "unauthenticated");

  if (user.email_confirmed_at) return ok({ sent: false, alreadyVerified: true });

  await rateLimit(`confirmation:resend:${user.id}`, 1, 5 * 60 * 1000);
  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
  if (error) throw new HttpError(400, error.message, "resend_failed");

  const { data: profile } = await getSupabaseAdmin().from("users").select("role").eq("id", user.id).single();
  await audit({
    actorId: user.id,
    actorRole: (profile?.role ?? "buyer") as Role,
    action: "auth.confirmation_resent",
    targetType: "user",
    targetId: user.id,
    ip: requestIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return ok({ sent: true });
});
