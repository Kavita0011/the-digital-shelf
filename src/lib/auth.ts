import type { NextRequest } from "next/server";
import { createSupabaseServerClient, getSupabaseAdmin } from "./supabase";
import { readImpersonationRole } from "./impersonation";
import type { AuthenticatedUser, Role } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
  ) {
    super(message);
  }
}

/** Resolve the current user from Supabase session cookies and public.users. */
export async function getCurrentUser(options: { ignoreImpersonation?: boolean } = {}): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  // Unconfirmed signups must not be treated as authenticated users.
  if (!authUser || !authUser.email_confirmed_at) return null;

  const { data: profile } = await getSupabaseAdmin()
    .from("users")
    .select("id,email,role,status,full_name")
    .eq("id", authUser.id)
    .single();
  if (!profile || profile.status !== "active") return null;

  const realRole = profile.role as Role;
  const impersonated = options.ignoreImpersonation || realRole !== "super_admin"
    ? null
    : await readImpersonationRole(profile.id);

  return {
    id: profile.id,
    email: profile.email,
    role: impersonated ?? realRole,
    realRole,
    impersonating: Boolean(impersonated),
    status: profile.status as "active",
    fullName: profile.full_name,
  };
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Authentication required", "unauthenticated");
  return user;
}

const ROLE_RANK: Record<Role, number> = { buyer: 0, seller: 1, admin: 2, super_admin: 3 };

/** RBAC: require at least the given role. */
export async function requireRole(minRole: Role): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (ROLE_RANK[user.role] < ROLE_RANK[minRole]) {
    throw new HttpError(403, "Insufficient permissions", "forbidden");
  }
  return user;
}

export function isAdmin(role: Role): boolean {
  return role === "admin" || role === "super_admin";
}

/** Prevent admins from targeting peers/superiors or themselves. */
export function assertCanManageUser(actor: AuthenticatedUser, targetId: string, targetRole: Role): void {
  if (actor.id === targetId) throw new HttpError(403, "You cannot target your own account", "forbidden");
  if (ROLE_RANK[actor.role] <= ROLE_RANK[targetRole]) {
    throw new HttpError(403, "You cannot manage a user with equal or higher privileges", "forbidden");
  }
}

/**
 * Extract the client IP using only the last forwarding hop, which is the
 * address appended by the trusted edge proxy. The first X-Forwarded-For value
 * is client-controlled and must never be trusted for rate limiting.
 */
export function requestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
    return hops.length ? hops[hops.length - 1] : null;
  }
  return req.headers.get("x-real-ip");
}
