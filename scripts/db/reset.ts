/**
 * Drops and recreates the public and drizzle schemas, then re-applies all migrations.
 * DESTRUCTIVE. Refuses to run against a non-local host or with NODE_ENV=production unless
 * `--force` is passed.
 *   npm run db:reset            -> DATABASE_URL
 *   npm run db:reset -- --test  -> TEST_DATABASE_URL
 */
import { isLocalHost, makePool, redact, resolveDatabaseUrl, runMigrations } from "./_shared";

async function main(): Promise<void> {
  const { url, label } = resolveDatabaseUrl();
  const force = process.argv.includes("--force");
  if (!force && (process.env.NODE_ENV === "production" || !isLocalHost(url))) {
    throw new Error(
      `Refusing to reset ${redact(url)} (non-local or production). Pass --force to override.`,
    );
  }
  const pool = makePool(url);
  try {
    console.log(`[db:reset] dropping schemas on ${label} database ${redact(url)}`);
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
    // Extensions live in public and were dropped with it; the migrations recreate them.
    const summary = await runMigrations(pool);
    console.log(`[db:reset] done — ${summary}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:reset] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
