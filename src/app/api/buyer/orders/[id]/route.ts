import { parseUuidParam } from "@/lib/query";
import { ok, route } from "@/lib/api";
import { requireUser, HttpError } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const id = parseUuidParam((await ctx.params).id);
  const { data, error } = await getSupabaseAdmin().from("orders")
    .select("*,products(title,slug),seller_profiles(store_name),payments(*),refunds(*)")
    .eq("id", id).eq("buyer_id", user.id).single();
  if (error || !data) throw new HttpError(404, "Order not found", "not_found");
  return ok(data);
});
