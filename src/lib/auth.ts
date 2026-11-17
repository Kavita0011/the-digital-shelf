import type { NextRequest } from "next/server";
import { createSupabaseServerClient, getSupabaseAdmin } from "./supabase";
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
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await getSupabaseAdmin()
    .from("users")
    .select("id,email,role,status,full_name")
    .eq("id", authUser.id)
    .single();
  if (!profile || profile.status !== "active") return null;

  return {
    id: profile.id,
    email: profile.email,
    role: profile.role as Role,
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

/** Extract request IP safely (proxy-aware only behind trusted proxy). */
export function requestIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip");
}
