import { NextResponse, type NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { assertCsrf, csrfCookieOptions } from "@/lib/csrf";
import { requestIp } from "@/lib/auth";
import type { Role } from "@/lib/types";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const ip = requestIp(req);
  await rateLimit(`login:ip:${ip ?? "unknown"}`, 10, 15 * 60 * 1000);
  const { email, password } = loginSchema.parse(await req.json());
  const accountKey = email.trim().toLowerCase();
  // Per-account lockout survives IP rotation by an attacker.
  await rateLimit(`login:account:${accountKey}`, 10, 15 * 60 * 1000);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await rateLimit(`login:failed:${accountKey}`, 5, 15 * 60 * 1000);
    await audit({
      actorId: null,
      actorRole: "anonymous",
      action: "auth.login_failed",
      targetType: "user",
      targetId: accountKey,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json(
      { ok: false, error: { code: "invalid_credentials", message: "Invalid email or password" } },
      { status: 401 },
    );
  }

  const { data: profile, error: profileError } = await getSupabaseAdmin()
    .from("users")
    .select("role,status")
    .eq("id", data.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return NextResponse.json(
      { ok: false, error: { code: "account_inactive", message: "This account is not active" } },
      { status: 403 },
    );
  }
  const role = profile.role as Role;

  await audit({
    actorId: data.user.id,
    actorRole: role,
    action: "auth.login",
    targetType: "user",
    targetId: data.user.id,
    ip,
    userAgent: req.headers.get("user-agent"),
  });
  // Rotate the CSRF token when privileges change.
  const response = ok({ authenticated: true, role });
  const csrf = csrfCookieOptions();
  response.cookies.set(csrf.name, csrf.value, csrf.options);
  return response;
});
