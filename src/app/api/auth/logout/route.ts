import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ok, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getCurrentUser, requestIp } from "@/lib/auth";
import { assertCsrf } from "@/lib/csrf";

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
  return ok({ loggedOut: true });
});
