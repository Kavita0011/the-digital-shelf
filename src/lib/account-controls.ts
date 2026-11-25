import { getSupabaseAdmin } from "./admin-db";
import { audit } from "./audit";
import { HttpError } from "./auth";
import type { Role } from "./types";

interface AccountActor {
  actorId: string;
  actorRole: Role;
  ip?: string | null;
}

function tombstoneEmail(id: string): string {
  return `deleted-${id}@invalid.local`;
}

function assertKnownTarget(target: { id: string; status: string } | null): asserts target is { id: string; status: string } {
  if (!target) throw new HttpError(404, "User not found", "not_found");
  if (target.status === "deleted") throw new HttpError(409, "Account already deleted", "already_deleted");
}

/**
 * Delete an account without destroying orders, payments, credits, downloads,
 * or audit history. The auth user is soft-deleted so sessions are revoked and
 * the original login stops working, while referenced records remain valid.
 */
export async function deleteAccount(
  id: string,
  actor: AccountActor & { self: boolean },
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data: target, error: targetError } = await db.from("users")
    .select("id,email,role,status")
    .eq("id", id)
    .single();
  if (targetError) throw targetError;
  assertKnownTarget(target);

  if (target.role === "super_admin") {
    const { count, error: countError } = await db.from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "super_admin")
      .eq("status", "active")
      .neq("id", id);
    if (countError) throw countError;
    if ((count ?? 0) === 0) {
      throw new HttpError(403, "The last super admin cannot be deleted", "last_super_admin");
    }
  }

  const { data: seller, error: sellerError } = await db.from("seller_profiles")
    .select("id")
    .eq("user_id", id)
    .maybeSingle();
  if (sellerError) throw sellerError;

  if (seller) {
    const { error: productsError } = await db.from("products")
      .update({ status: "removed" })
      .eq("seller_id", seller.id)
      .neq("status", "removed");
    if (productsError) throw productsError;

    const { error: profileError } = await db.from("seller_profiles").update({
      store_name: "Deleted shop",
      bio: null,
      profile_image: null,
      verification_status: "revoked",
      payout_status: "not_connected",
    }).eq("id", seller.id);
    if (profileError) throw profileError;
  }

  const { error: updateError } = await db.from("users").update({
    email: tombstoneEmail(id),
    full_name: null,
    role: "buyer",
    status: "deleted",
    deleted_at: new Date().toISOString(),
  }).eq("id", id);
  if (updateError) throw updateError;

  // Soft-delete the auth identity. If this fails, status still blocks all app
  // access on every server request, so deletion remains effective.
  const { error: authError } = await db.auth.admin.deleteUser(id, true);
  if (authError) console.error("auth soft delete failed", authError);

  await audit({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: actor.self ? "account.deleted" : "user.deleted",
    targetType: "user",
    targetId: id,
    metadata: {
      email: target.email,
      previousRole: target.role,
      previousStatus: target.status,
      authSoftDeleted: !authError,
    },
    ip: actor.ip,
  });
}

/**
 * Revoke elevated access without deleting history: demote to buyer, suspend
 * login, and revoke seller permissions. Admins cannot target peers/superiors;
 * callers must enforce that before invoking this function.
 */
export async function revokePermissions(
  id: string,
  actor: AccountActor,
): Promise<{ role: "buyer"; status: "suspended" }> {
  const db = getSupabaseAdmin();
  const { data: target, error: targetError } = await db.from("users")
    .select("id,email,role,status")
    .eq("id", id)
    .single();
  if (targetError) throw targetError;
  assertKnownTarget(target);

  const { error: updateError } = await db.from("users")
    .update({ role: "buyer", status: "suspended" })
    .eq("id", id);
  if (updateError) throw updateError;

  const { data: seller } = await db.from("seller_profiles")
    .select("id")
    .eq("user_id", id)
    .maybeSingle();
  if (seller) {
    const { error: sellerError } = await db.from("seller_profiles").update({
      verification_status: "revoked",
      payout_status: "not_connected",
    }).eq("id", seller.id);
    if (sellerError) throw sellerError;
  }

  await audit({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: "user.permissions_revoked",
    targetType: "user",
    targetId: id,
    metadata: {
      email: target.email,
      fromRole: target.role,
      fromStatus: target.status,
      toRole: "buyer",
      toStatus: "suspended",
    },
    ip: actor.ip,
  });

  return { role: "buyer", status: "suspended" };
}
