import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { deleteAccount } from "@/lib/account-controls";
import { assertCsrf, csrfCookieOptions } from "@/lib/csrf";
import { requestIp, requireUser } from "@/lib/auth";
import { clearImpersonationCookie } from "@/lib/impersonation";
import { createSupabaseServerClient, getSupabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({ confirm: z.literal("DELETE") });

/** Self-service account deletion. Requires explicit confirmation and CSRF. */
export const POST = route(async (req: NextRequest) => {
  assertCsrf(req);
  const user = await requireUser();
  bodySchema.parse(await req.json());

  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    const { error } = await getSupabaseAdmin().auth.admin.signOut(session.access_token, "global");
    if (error) console.error("session revoke failed", error);
  }

  await deleteAccount(user.id, {
    actorId: user.id,
    actorRole: user.realRole,
    ip: requestIp(req),
    self: true,
  });

  await supabase.auth.signOut({ scope: "local" });
  await clearImpersonationCookie();

  const response = ok({ deleted: true });
  const csrf = csrfCookieOptions();
  response.cookies.set(csrf.name, csrf.value, csrf.options);
  return response;
});
