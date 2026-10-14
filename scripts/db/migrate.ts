/**
 * Applies pending Drizzle migrations from db/migrations.
 *   npm run db:migrate            -> DATABASE_URL
 *   npm run db:migrate -- --test  -> TEST_DATABASE_URL
 */
import { makePool, redact, resolveDatabaseUrl, runMigrations } from "./_shared";

async function main(): Promise<void> {
  const { url, label } = resolveDatabaseUrl();
  const pool = makePool(url);
  const started = Date.now();
  try {
    console.log(`[db:migrate] ${label} database ${redact(url)}`);
    const summary = await runMigrations(pool);
    console.log(`[db:migrate] ok in ${Date.now() - started}ms — ${summary}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});
