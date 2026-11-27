import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase";
import { currentSessionId, listUserSessions, MAX_SESSIONS } from "@/lib/sessions";

/** Signed-in account security state: verification status and active devices. */
export const GET = route(async () => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const current = await currentSessionId(supabase);
  const sessions = await listUserSessions(user.id, current);

  return ok({
    email: authUser?.email ?? user.email,
    emailConfirmedAt: authUser?.email_confirmed_at ?? null,
    sessions,
    maxSessions: MAX_SESSIONS,
  });
});
