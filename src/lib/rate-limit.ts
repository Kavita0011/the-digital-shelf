import { getCloudflareContext } from "@opennextjs/cloudflare";
import { LRUCache } from "./lru-cache";
import { HttpError } from "./auth";

interface Bucket { count: number; resetAt: number }

/** Local fallback for `next dev` and non-Cloudflare runtimes. */
const buckets = new LRUCache<string, Bucket>(10_000);

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

function sharedStore(): KVLike | null {
  try {
    const { env } = getCloudflareContext();
    const kv = (env as Record<string, unknown> | undefined)?.RATE_LIMIT_KV as KVLike | undefined;
    if (kv && typeof kv.get === "function" && typeof kv.put === "function") return kv;
  } catch {
    // Not running inside a Cloudflare Worker.
  }
  return null;
}

/**
 * Fixed-window limiter. Uses Cloudflare KV when the binding is present so the
 * limit is shared across isolates; falls back to an in-process cache locally.
 * KV is a soft limit under races — keep WAF rate-limit rules as the hard layer.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const kv = sharedStore();

  if (!kv) {
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
    }
    return;
  }

  const storageKey = `ratelimit:${key}`;
  const raw = await kv.get(storageKey);
  let entry: Bucket | null = null;
  if (raw) {
    try { entry = JSON.parse(raw) as Bucket; } catch { entry = null; }
  }

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
  } else {
    entry.count += 1;
  }

  await kv.put(storageKey, JSON.stringify(entry), {
    expirationTtl: Math.max(60, Math.ceil(windowMs / 1000)),
  });

  if (entry.count > limit) {
    throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
  }
}

export async function rateLimitByIp(ip: string | null, scope: string, limit: number, windowMs: number): Promise<void> {
  await rateLimit(`${scope}:${ip ?? "unknown"}`, limit, windowMs);
}
