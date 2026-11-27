import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { HttpError, requireUser, requestIp } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase";
import { audit } from "@/lib/audit";
import { currentSessionId, listUserSessions, revokeUserSession } from "@/lib/sessions";

const schema = z
  .object({
    sessionId: z.string().uuid().optional(),
    allOthers: z.boolean().optional(),
  })
  .refine((value) => value.allOthers === true || Boolean(value.sessionId), {
    message: "Provide a session id or set allOthers to true",
  });

/** Revoke one device or every session except the current one. */
export const DELETE = route(async (req: NextRequest) => {
  const user = await requireUser();
  const { sessionId, allOthers } = schema.parse(await req.json());
  const supabase = await createSupabaseServerClient();
  const current = await currentSessionId(supabase);

  let revoked = 0;
  if (allOthers) {
    const others = (await listUserSessions(user.id, current)).filter((session) => !session.isCurrent);
    for (const session of others) {
      if (await revokeUserSession(user.id, session.id)) revoked += 1;
    }
  } else {
    if (sessionId === current) {
      throw new HttpError(400, "Use the logout button to end this session", "current_session");
    }
    if (!sessionId) throw new HttpError(400, "Invalid session id", "invalid_session");
    if (!(await revokeUserSession(user.id, sessionId))) {
      throw new HttpError(404, "Session not found", "not_found");
    }
    revoked = 1;
  }

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: "auth.session_revoked",
    targetType: "user",
    targetId: user.id,
    metadata: { revoked, allOthers: Boolean(allOthers) },
    ip: requestIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  return ok({ revoked });
});
