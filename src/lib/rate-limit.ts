import { LRUCache } from "./lru-cache";
import { HttpError } from "./auth";

interface Bucket { count: number; resetAt: number }
const buckets = new LRUCache<string, Bucket>(10_000);

/**
 * In-process fixed-window rate limiter. Suitable for a single instance;
 * for multi-instance deployments swap with Upstash Redis or Supabase-level
 * limiting. All sensitive endpoints call this before doing work.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    throw new HttpError(429, "Too many requests. Please try again later.", "rate_limited");
  }
}

export function rateLimitByIp(ip: string | null, scope: string, limit: number, windowMs: number) {
  rateLimit(`${scope}:${ip ?? "unknown"}`, limit, windowMs);
}
