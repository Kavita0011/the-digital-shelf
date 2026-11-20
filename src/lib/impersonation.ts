import { cookies } from "next/headers";
import { requireEnv } from "./env";

/**
 * Signed, short-lived "view as" override for super admins.
 * The stored account role is never modified; only the effective role in
 * getCurrentUser() changes while the cookie is present.
 */
const COOKIE_NAME = "ds_view_as";
const MAX_AGE_SECONDS = 60 * 60;
export const IMPERSONABLE_ROLES = ["buyer", "seller", "admin"] as const;
export type ImpersonableRole = (typeof IMPERSONABLE_ROLES)[number];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(requireEnv("SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function createImpersonationToken(userId: string, role: ImpersonableRole): Promise<string> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ userId, role, expiresAt })));
  return `${payload}.${await sign(payload)}`;
}

export async function verifyImpersonationToken(token: string, userId: string): Promise<ImpersonableRole | null> {
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;

  const expected = await sign(payload);
  if (signature.length !== expected.length) return null;
  let matches = 0;
  for (let i = 0; i < signature.length; i++) matches |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  if (matches !== 0) return null;

  try {
    const parsed = JSON.parse(decoder.decode(fromBase64Url(payload))) as {
      userId?: unknown;
      role?: unknown;
      expiresAt?: unknown;
    };
    if (parsed.userId !== userId || typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    if (!IMPERSONABLE_ROLES.includes(parsed.role as ImpersonableRole)) return null;
    return parsed.role as ImpersonableRole;
  } catch {
    return null;
  }
}

export async function setImpersonationCookie(userId: string, role: ImpersonableRole): Promise<void> {
  const token = await createImpersonationToken(userId, role);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Returns the active override only for the given super admin. */
export async function readImpersonationRole(userId: string): Promise<ImpersonableRole | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyImpersonationToken(token, userId);
}
