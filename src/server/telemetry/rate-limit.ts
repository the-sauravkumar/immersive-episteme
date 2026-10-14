/**
 * In-process token-bucket rate limiter for telemetry uploads, keyed by the authenticated
 * principal (participant session, demo id or staff user), never by a client-supplied value.
 *
 * Single-process only: with several app instances each keeps its own buckets, so the effective
 * limit multiplies by the instance count. That is acceptable for a lab deployment (one Node
 * server); a multi-instance deployment should move this to Postgres (like auth_rate_limits).
 */
export interface RateLimitPolicy {
  /** Requests allowed in a burst. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

/** Normal clients send one batch every few seconds plus page-exit beacons. */
export const TELEMETRY_RATE_LIMIT: RateLimitPolicy = { capacity: 30, refillPerSecond: 0.5 };

export type RateLimitDecision = { allowed: true; remaining: number } | { allowed: false; retryAfterSeconds: number };

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();

  constructor(
    private readonly policy: RateLimitPolicy = TELEMETRY_RATE_LIMIT,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  take(key: string): RateLimitDecision {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.policy.capacity, at: t };
    const tokens = Math.min(this.policy.capacity, b.tokens + ((t - b.at) / 1000) * this.policy.refillPerSecond);
    if (tokens < 1) {
      this.buckets.set(key, { tokens, at: t });
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / this.policy.refillPerSecond)) };
    }
    this.buckets.delete(key); // re-insert to keep Map order = recency
    this.buckets.set(key, { tokens: tokens - 1, at: t });
    while (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
    return { allowed: true, remaining: Math.floor(tokens - 1) };
  }
}
