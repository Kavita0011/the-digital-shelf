import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getCurrentUser, requestIp } from "@/lib/auth";
import { assertCsrf, csrfCookieOptions } from "@/lib/csrf";

export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  if (user) {
    await audit({
      actorId: user.id,
      actorRole: user.role,
      action: "auth.logout",
      targetType: "user",
      targetId: user.id,
      ip: requestIp(req),
    });
  }
  const response = ok({ loggedOut: true });
  const csrf = csrfCookieOptions();
  response.cookies.set(csrf.name, csrf.value, csrf.options);
  return response;
});
