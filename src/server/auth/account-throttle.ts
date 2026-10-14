/**
 * Per-account sign-in throttle. The IP rate limit (Better Auth, src/server/auth/config.ts)
 * slows one client down; this caps password guessing against ONE account no matter how many
 * addresses the attempts come from.
 *
 * Every POST /api/auth/sign-in/email consumes an attempt for the submitted email (counted
 * BEFORE the password check, atomically, so parallel bursts cannot overshoot). More than
 * `maxAttempts` within `windowSeconds` locks the email for `lockSeconds` (HTTP 429). A
 * successful sign-in clears the counter. The key is sha256 of the normalised email, so the
 * table stores no addresses and behaves the same for unknown accounts (no enumeration signal).
 *
 * Not `server-only`: the Better Auth factory that uses it also runs in scripts and tests.
 */
import { createHash } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { authSignInThrottle } from "@db/schema/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

export type AccountThrottleOptions = {
  maxAttempts: number;
  windowSeconds: number;
  lockSeconds: number;
};

export const DEFAULT_ACCOUNT_THROTTLE: AccountThrottleOptions = {
  maxAttempts: 10,
  windowSeconds: 15 * 60,
  lockSeconds: 15 * 60,
};

export function signInThrottleKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

export type ThrottleDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Consume one attempt for `email`; refuses while the account is locked. */
export async function consumeSignInAttempt(
  db: AnyPgDatabase,
  email: string,
  opts: AccountThrottleOptions = DEFAULT_ACCOUNT_THROTTLE,
  now: Date = new Date(),
): Promise<ThrottleDecision> {
  const key = signInThrottleKey(email);
  const nowIso = now.toISOString();
  const window = `${opts.windowSeconds} seconds`;
  const lock = `${opts.lockSeconds} seconds`;
  // One statement: either start a row, or (unless locked) count the attempt, restarting the
  // window when it has elapsed, and set the lock when the count passes the limit.
  const result = await db.execute<{ attempts: number; locked_until_ms: number | null }>(sql`
    WITH upsert AS (
      INSERT INTO auth_sign_in_throttle AS t (email_sha256, attempts, window_started_at, locked_until)
      VALUES (${key}, 1, ${nowIso}::timestamptz, NULL)
      ON CONFLICT (email_sha256) DO UPDATE SET
        attempts = CASE
          WHEN t.locked_until > ${nowIso}::timestamptz THEN t.attempts
          WHEN t.window_started_at <= ${nowIso}::timestamptz - ${window}::interval THEN 1
          ELSE t.attempts + 1 END,
        window_started_at = CASE
          WHEN t.locked_until > ${nowIso}::timestamptz THEN t.window_started_at
          WHEN t.window_started_at <= ${nowIso}::timestamptz - ${window}::interval THEN ${nowIso}::timestamptz
          ELSE t.window_started_at END,
        locked_until = CASE
          WHEN t.locked_until > ${nowIso}::timestamptz THEN t.locked_until
          WHEN t.window_started_at > ${nowIso}::timestamptz - ${window}::interval
               AND t.attempts + 1 > ${opts.maxAttempts}
            THEN ${nowIso}::timestamptz + ${lock}::interval
          ELSE NULL END
      RETURNING t.attempts, t.locked_until
    )
    SELECT attempts, (extract(epoch FROM locked_until) * 1000)::float8 AS locked_until_ms FROM upsert
  `);
  const row = result.rows[0];
  const lockedUntilMs = row?.locked_until_ms == null ? null : Number(row.locked_until_ms);
  if (lockedUntilMs === null || lockedUntilMs <= now.getTime()) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - now.getTime()) / 1000)) };
}

/** Forget the counter after a successful sign-in. */
export async function clearSignInAttempts(db: AnyPgDatabase, email: string): Promise<void> {
  await db.delete(authSignInThrottle).where(eq(authSignInThrottle.emailSha256, signInThrottleKey(email)));
}
