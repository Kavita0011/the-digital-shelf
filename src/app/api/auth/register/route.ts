import type { NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { rateLimitByIp, rateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/csrf";
import { HttpError, requestIp } from "@/lib/auth";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const ip = requestIp(req);
  rateLimitByIp(ip, "register", 5, 60 * 60 * 1000);
  const body = registerSchema.parse(await req.json());

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: { full_name: body.fullName } },
  });
  if (error) throw new HttpError(400, error.message, "registration_failed");
  if (!data.user) throw new HttpError(400, "Could not create account", "registration_failed");

  // handle_new_user() always creates a buyer (roles are never trusted from
  // signup metadata). Promote seller accounts here, using the service role,
  // after validating the role with Zod. Admin roles cannot be self-assigned.
  if (body.role === "seller") {
    const { error: roleError } = await getSupabaseAdmin().from("users")
      .update({ role: "seller" }).eq("id", data.user.id);
    if (roleError) throw roleError;
    await getSupabaseAdmin().from("seller_profiles").insert({
      user_id: data.user.id,
      store_name: `${body.fullName}'s Store`,
    });
  }
  await audit({
    actorId: data.user.id,
    actorRole: body.role,
    action: "user.registered",
    targetType: "user",
    targetId: data.user.id,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  return ok({ userId: data.user.id, requiresConfirmation: !data.session }, 201);
});
