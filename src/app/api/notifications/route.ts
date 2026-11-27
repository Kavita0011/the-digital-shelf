import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Notification } from "@/lib/types";

const patchSchema = z
  .object({
    id: z.string().uuid().optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all === true || Boolean(value.id), {
    message: "Provide a notification id or set all to true",
  });

const NOTIFICATION_COLUMNS = "id,type,title,body,link,read_at,created_at";

/** Notifications are always scoped to the signed-in user, never to a supplied id. */
async function loadNotifications(userId: string): Promise<{
  notifications: Notification[];
  unreadCount: number;
}> {
  const db = getSupabaseAdmin();
  const [list, unread] = await Promise.all([
    db.from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null),
  ]);
  if (list.error) throw list.error;
  if (unread.error) throw unread.error;
  return { notifications: (list.data ?? []) as Notification[], unreadCount: unread.count ?? 0 };
}

export const GET = route(async () => {
  const user = await requireUser();
  return ok(await loadNotifications(user.id));
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

  // Return fresh state so the caller never has to guess whether the badge or
  // row highlight changed. This also makes "mark read" idempotent: marking an
  // already-read row simply returns the current list.
  const result = await loadNotifications(user.id);
  return ok({ updated: true, ...result });
});
