/**
 * Edge-runtime CSRF cookie creation. Uses Web Crypto so the middleware bundle
 * stays runtime-neutral. Output is byte-identical to csrf.ts's node HMAC.
 */
const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(token));
  return toHex(new Uint8Array(signature));
}

export async function newCsrfTokenEdge(secret: string): Promise<{ token: string; cookie: string }> {
  const token = toHex(crypto.getRandomValues(new Uint8Array(24)));
  return { token, cookie: `${token}.${await sign(token, secret)}` };
}

export const CSRF_COOKIE_NAME_EDGE = "ds_csrf";
