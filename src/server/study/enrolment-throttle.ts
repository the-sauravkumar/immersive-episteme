/**
 * Enrolment throttle (final review security-04). Enrolment needs no account: the study code is
 * all a script needs to create participants, consents and sessions, and by scripting the blind
 * steps it could use up allocation slots and unbalance the blocks among real participants. Two
 * fixed-window counters bound that, stored in Postgres (shared between server processes, kept
 * across restarts, as the sign-in throttle in src/server/auth/account-throttle.ts):
 *  - per client address and study: `maxPerAddressPer10Minutes` (default 30: a lab of machines
 *    behind one NAT address can still start together);
 *  - per study: `maxPerHour` (default 120), whatever addresses the requests come from.
 * Every attempt counts, refused ones too. Keys are sha256 values, so no address is stored. Demo
 * studies (staff test runs) are not throttled. The participant cap (`maxParticipants`) is checked
 * by enrolParticipant under a per-study lock.
 *
 * Not `server-only`: the integration tests run it against a throwaway database.
 */
import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

type Q = Pick<Pool | PoolClient, "query">;

export const ENROLMENT_LIMIT_DEFAULTS = { maxPerAddressPer10Minutes: 30, maxPerHour: 120 } as const;

const ADDRESS_WINDOW_SECONDS = 10 * 60;
const STUDY_WINDOW_SECONDS = 60 * 60;

export type EnrolmentThrottleDecision = { allowed: true } | { allowed: false; scope: "address" | "study"; retryAfterSeconds: number };

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Counts one attempt in a fixed window; returns the count in the window and when it ends. */
async function bump(q: Q, key: string, windowSeconds: number, now: Date): Promise<{ attempts: number; windowEndsMs: number }> {
  const r = await q.query<{ attempts: number; window_started_at: Date }>(
    `INSERT INTO study_enrolment_throttle AS t (key_sha256, attempts, window_started_at) VALUES ($1, 1, $2::timestamptz)
     ON CONFLICT (key_sha256) DO UPDATE SET
       attempts = CASE WHEN t.window_started_at <= $2::timestamptz - make_interval(secs => $3) THEN 1 ELSE t.attempts + 1 END,
       window_started_at = CASE WHEN t.window_started_at <= $2::timestamptz - make_interval(secs => $3) THEN $2::timestamptz ELSE t.window_started_at END
     RETURNING attempts, window_started_at`,
    [key, now.toISOString(), windowSeconds],
  );
  const row = r.rows[0]!;
  return { attempts: row.attempts, windowEndsMs: row.window_started_at.getTime() + windowSeconds * 1000 };
}

/**
 * Consumes one enrolment attempt for `studyId` from `address` (the client IP, or null when the
 * server cannot tell it; then only the per-study limit applies).
 */
export async function consumeEnrolmentAttempt(
  q: Q,
  input: { studyId: string; address: string | null; limits?: { maxPerAddressPer10Minutes?: number; maxPerHour?: number } },
  now: Date = new Date(),
): Promise<EnrolmentThrottleDecision> {
  const perAddress = input.limits?.maxPerAddressPer10Minutes ?? ENROLMENT_LIMIT_DEFAULTS.maxPerAddressPer10Minutes;
  const perStudy = input.limits?.maxPerHour ?? ENROLMENT_LIMIT_DEFAULTS.maxPerHour;
  const retry = (endsMs: number) => Math.max(1, Math.ceil((endsMs - now.getTime()) / 1000));
  const study = await bump(q, sha256(`study\0${input.studyId}`), STUDY_WINDOW_SECONDS, now);
  if (input.address) {
    const addr = await bump(q, sha256(`address\0${input.studyId}\0${input.address}`), ADDRESS_WINDOW_SECONDS, now);
    if (addr.attempts > perAddress) return { allowed: false, scope: "address", retryAfterSeconds: retry(addr.windowEndsMs) };
  }
  if (study.attempts > perStudy) return { allowed: false, scope: "study", retryAfterSeconds: retry(study.windowEndsMs) };
  return { allowed: true };
}

/**
 * The client address of a Server Action request: the first hop of the forwarding header. The
 * proxy (src/proxy.ts) strips client-supplied forwarding headers on /study when no reverse proxy
 * is trusted, so Next.js fills the header from the socket; behind a trusted proxy the header is
 * the proxy's (AUTH_CLIENT_IP_HEADER, x-forwarded-for by default), walked past AUTH_TRUSTED_PROXIES.
 */
export function clientAddress(headers: Pick<Headers, "get">, opts: { header?: string; trustedProxies?: readonly string[] } = {}): string | null {
  const raw = headers.get(opts.header ?? "x-forwarded-for");
  if (!raw) return null;
  const hops = raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const trusted = new Set(opts.trustedProxies ?? []);
  for (let i = hops.length - 1; i >= 0; i--) if (!trusted.has(hops[i]!)) return hops[i]!;
  return hops[0] ?? null;
}
