export interface RateLimitPolicy {
  capacity: number;
  refillPerSecond: number;
}

const TELEMETRY_RATE_LIMIT: RateLimitPolicy = { capacity: 30, refillPerSecond: 0.5 };

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
    this.buckets.delete(key);
    this.buckets.set(key, { tokens: tokens - 1, at: t });
    while (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!);
    return { allowed: true, remaining: Math.floor(tokens - 1) };
  }
}
