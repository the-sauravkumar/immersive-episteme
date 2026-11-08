import { createHash } from "node:crypto";

import type { Pool, PoolClient } from "pg";

type Q = Pick<Pool | PoolClient, "query">;

const ENROLMENT_LIMIT_DEFAULTS = { maxPerAddressPer10Minutes: 30, maxPerHour: 120 } as const;

const ADDRESS_WINDOW_SECONDS = 10 * 60;
const STUDY_WINDOW_SECONDS = 60 * 60;

export type EnrolmentThrottleDecision = { allowed: true } | { allowed: false; scope: "address" | "study"; retryAfterSeconds: number };

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

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
