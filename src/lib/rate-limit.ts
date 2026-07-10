// Best-effort in-memory rate limiter for the public (unauthenticated) HTTP
// surface — the tracking pixels, click redirect, unsubscribe, and email
// webhooks. It caps how fast a single client IP can drive unauthenticated
// service-role writes and Inngest fan-out, blunting flood/cost-amplification.
//
// LIMITATION: state lives in the process, so in a multi-instance / serverless
// deployment each instance limits independently and cold starts reset counters.
// It is a mitigation, not a hard guarantee — pair with an edge/CDN or a shared
// store (e.g. Upstash) for production-grade limits. It intentionally fails open
// on its own errors: rate limiting must never take down a legitimate webhook.

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

/**
 * Token-bucket check. Returns whether the request is allowed and, if not, how
 * many seconds until a token frees up.
 *
 * @param key        identity to limit on (usually the client IP + route)
 * @param limit      bucket capacity (burst)
 * @param windowSec  seconds over which the bucket fully refills
 * @param now        current epoch ms (injectable for tests)
 */
export function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  now: number = Date.now()
): { allowed: boolean; retryAfter: number } {
  // Opportunistic cleanup so the map can't grow unbounded.
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) {
      if (now - b.updatedAt > windowSec * 1000 * 2) buckets.delete(k);
    }
    lastSweep = now;
  }

  const refillPerMs = limit / (windowSec * 1000);
  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: limit, updatedAt: now };
  if (existing) {
    bucket.tokens = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
    bucket.updatedAt = now;
  }

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const retryAfter = Math.ceil((1 - bucket.tokens) / refillPerMs / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from proxy headers; falls back to a shared bucket. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
