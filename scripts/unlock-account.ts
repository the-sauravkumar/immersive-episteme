/**
 * Clear the per-account sign-in lock of a staff account (final review security-09).
 *
 *   npx tsx scripts/unlock-account.ts --email pi@example.org --by admin@example.org --reason "locked out by repeated guesses" [--test]
 *
 * The lock (src/server/auth/account-throttle.ts) is applied after 10 attempts in 15 minutes from
 * any address; a stranger who knows the email can trigger it. The owner's own browser normally
 * still gets in (known-device bucket); this script is for a new browser or a known browser that
 * is locked too. `--by` must be an active platform administrator (permission admin.users); the
 * clearance is written to the audit log with the reason. Nothing else about the account changes.
 * --test targets TEST_DATABASE_URL instead of DATABASE_URL.
 */
import { parseArgs } from "node:util";

import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "../db/schema";
import { permissionsForRoles } from "../src/lib/permissions/matrix";
import { clearSignInLock } from "../src/server/auth/account-throttle";
import { loadUserRoles } from "../src/server/auth/roles-repository";

import { makePool, redact, resolveDatabaseUrl } from "./db/_shared";

function usage(): never {
  console.error('Usage: npx tsx scripts/unlock-account.ts --email <locked email> --by <admin email> --reason "<why>" [--test]');
  process.exit(2);
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      by: { type: "string" },
      reason: { type: "string" },
      test: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  if (values.help || !values.email || !values.by || !values.reason || values.reason.trim().length < 3) usage();

  const { url, label } = resolveDatabaseUrl(values.test ? ["--test"] : []);
  const pool = makePool(url);
  try {
    const db = drizzle(pool, { schema, casing: "snake_case" });
    const admin = await pool.query<{ id: string; disabled_at: Date | null }>("SELECT id, disabled_at FROM users WHERE lower(email) = lower($1)", [values.by.trim()]);
    const adminRow = admin.rows[0];
    if (!adminRow || adminRow.disabled_at) throw new Error(`--by ${values.by} is not an active staff account`);
    if (!permissionsForRoles(await loadUserRoles(db, adminRow.id)).includes("admin.users")) {
      throw new Error(`--by ${values.by} is not a platform administrator (admin.users)`);
    }
    const target = await pool.query<{ id: string }>("SELECT id FROM users WHERE lower(email) = lower($1)", [values.email.trim()]);
    const { wasLocked } = await clearSignInLock(db, values.email);
    await pool.query(
      `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason)
       VALUES ('user', $1, 'admin.sign_in_lock_cleared', 'users', $2, $3::jsonb, $4)`,
      [adminRow.id, target.rows[0]?.id ?? null, JSON.stringify({ wasLocked, via: "scripts/unlock-account.ts" }), values.reason.trim()],
    );
    console.log(`[unlock-account] ${label} db ${redact(url)}\n  ${values.email}: ${wasLocked ? "lock cleared" : "was not locked (counters reset)"}; audited as ${values.by}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[unlock-account] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
