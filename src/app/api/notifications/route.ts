import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

const patchSchema = z
  .object({
    id: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || Boolean(value.id), {
    message: "Provide a notification id or set all to true",
  });

/** Notifications are always scoped to the signed-in user, never to a supplied id. */
export const GET = route(async () => {
  const user = await requireUser();
  const db = getSupabaseAdmin();
  const [list, unread] = await Promise.all([
    db.from("notifications")
      .select("id,type,title,body,link,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);
  if (list.error) throw list.error;
  if (unread.error) throw unread.error;

  return ok({ notifications: list.data ?? [], unreadCount: unread.count ?? 0 });
});

export const PATCH = route(async (req: NextRequest) => {
  const user = await requireUser();
  const body = patchSchema.parse(await req.json());
  const db = getSupabaseAdmin();

  let query = db.from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (body.all !== true) query = query.eq("id", body.id!);

  const { error } = await query;
  if (error) throw error;
  return ok({ updated: true });
});
