/**
 * Client-IP trust policy shared by src/proxy.ts (header stripping) and the Better Auth factory
 * (rate-limit keys). Dependency-free and not `server-only`, because the proxy imports it.
 *
 * Better Auth keys its IP rate limit on the client IP it reads from a forwarding header
 * (default `x-forwarded-for`). Next.js only fills that header from the socket address when the
 * request does NOT already carry one, so without a trusted proxy a client could pick its own
 * rate-limit bucket by sending `X-Forwarded-For: <random>` on every attempt.
 *
 * Policy:
 *  - No proxy configured (neither AUTH_TRUSTED_PROXIES nor AUTH_CLIENT_IP_HEADER): the proxy
 *    deletes every client-supplied forwarding header on /api/auth/*, so Next fills
 *    `x-forwarded-for` with the real socket address and Better Auth sees only that.
 *  - Behind a reverse proxy: set AUTH_TRUSTED_PROXIES to the proxy addresses (the chain is
 *    walked right to left past them) and, if the proxy uses another header, AUTH_CLIENT_IP_HEADER.
 *    The headers are then passed through untouched.
 */

/** Forwarding headers a client could use to claim an IP. */
export const CLIENT_IP_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "fastly-client-ip",
] as const;

export type ClientIpPolicy = {
  /** IPs/CIDRs of trusted reverse proxies. */
  trustedProxies: string[];
  /** Header carrying the client IP (lower-case). */
  header: string;
  /** True when a proxy deployment is configured and forwarding headers are trusted. */
  trustForwardedHeaders: boolean;
};

export function parseTrustedProxies(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Reads the policy from an env-like record (default: process.env, read at call time). */
export function clientIpPolicy(env: Record<string, string | undefined> = process.env): ClientIpPolicy {
  const trustedProxies = parseTrustedProxies(env.AUTH_TRUSTED_PROXIES);
  const configuredHeader = env.AUTH_CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;
  return {
    trustedProxies,
    header: configuredHeader ?? "x-forwarded-for",
    trustForwardedHeaders: trustedProxies.length > 0 || configuredHeader !== undefined,
  };
}

/**
 * Deletes client-supplied forwarding headers in place. Returns true when anything was removed.
 */
export function stripClientIpHeaders(headers: Headers): boolean {
  let changed = false;
  for (const name of CLIENT_IP_HEADERS) {
    if (headers.has(name)) {
      headers.delete(name);
      changed = true;
    }
  }
  return changed;
}
