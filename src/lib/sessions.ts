import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./admin-db";

/** Maximum number of simultaneously signed-in devices for one account. */
export const MAX_SESSIONS = 3;

interface SupabaseJwtPayload {
  session_id?: string;
}

/** Read the session id from a Supabase access token without trusting client input. */
export function sessionIdFromAccessToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as SupabaseJwtPayload;
    return typeof payload.session_id === "string" && payload.session_id ? payload.session_id : null;
  } catch {
    return null;
  }
}

/** Identify the current browser session from the SDK-managed access token. */
export async function currentSessionId(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ? sessionIdFromAccessToken(data.session.access_token) : null;
}

export interface UserSessionView {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  device: string;
  ip: string;
  isCurrent: boolean;
}

interface SessionRow {
  id: string;
  created_at: string;
  updated_at: string;
  refreshed_at: string | null;
  user_agent: string | null;
  ip: string | null;
}

/** Turn a user-agent string into a short, readable device label. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : /curl|node|Postman/i.test(userAgent) ? "API client"
    : "Browser";
  const os = /Windows/i.test(userAgent) ? "Windows"
    : /Android/i.test(userAgent) ? "Android"
    : /iPhone|iPad|iOS/i.test(userAgent) ? "iOS"
    : /Mac OS X|Macintosh/i.test(userAgent) ? "macOS"
    : /Linux/i.test(userAgent) ? "Linux"
    : "";
  return os ? `${browser} on ${os}` : browser;
}

export async function listUserSessions(userId: string, currentId: string | null): Promise<UserSessionView[]> {
  const { data, error } = await getSupabaseAdmin().rpc("list_user_sessions", { p_user_id: userId });
  if (error) throw error;
  return ((data ?? []) as SessionRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastSeenAt: row.refreshed_at ?? row.updated_at ?? row.created_at,
    device: deviceLabel(row.user_agent),
    ip: row.ip ?? "Unknown IP",
    isCurrent: row.id === currentId,
  }));
}

/** Keep the current session plus the newest others, capped at MAX_SESSIONS. */
export async function enforceSessionLimit(userId: string, currentId: string | null): Promise<number> {
  const { data, error } = await getSupabaseAdmin().rpc("enforce_user_session_limit", {
    p_user_id: userId,
    p_limit: MAX_SESSIONS,
    p_current_session_id: currentId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().rpc("revoke_user_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  if (error) throw error;
  return Number(data ?? 0) > 0;
}
