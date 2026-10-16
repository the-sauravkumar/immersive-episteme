/**
 * Loads ONLY the reference data a fresh database needs, never the demo dataset:
 *   - knowledge categories, relationship types and telemetry event types (db/seeds/reference.ts;
 *     idempotent upserts). telemetry_events.event_type_code references event_types, so without
 *     these rows no telemetry can be recorded; the content importer needs the relationship types;
 *   - questionnaire instrument definitions (src/server/study/instruments.ts): real, source-cited
 *     instruments, not demo and not craft content; INSERT ... ON CONFLICT DO NOTHING, so a
 *     definition the researchers have since locked or edited is never touched.
 * No users, no participants, no studies, no content.
 *
 *   npm run db:seed:reference             -> DATABASE_URL_UNPOOLED, else DATABASE_URL
 *   npm run db:seed:reference -- --test   -> TEST_DATABASE_URL
 *   production: npx tsx scripts/deploy/with-env.ts --env-file <file> -- npm run db:seed:reference
 *
 * Each part runs in one transaction; a second run changes nothing. Prints the row counts.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import { seedReferenceData } from "../../db/seeds/reference";
import { seedInstrumentDefinitions } from "../../src/server/study/instruments";
import { makePool, redact, resolveDatabaseUrl } from "./_shared";

const log = (msg: string) => console.log(`[db:seed:reference] ${msg}`);

async function main(): Promise<void> {
  const unknown = process.argv.slice(2).filter((a) => a !== "--test");
  if (unknown.length > 0) throw new Error(`Unknown argument(s): ${unknown.join(" ")} (the only option is --test)`);
  const { url, label } = resolveDatabaseUrl();
  log(`${label} database ${redact(url)}`);
  const pool = makePool(url);
  try {
    await seedReferenceData(drizzle(pool, { casing: "snake_case" }));
    log("reference (knowledge categories, relationship types, event types) ok");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await seedInstrumentDefinitions(client);
      await client.query("COMMIT");
      log(`instruments ok: ${inserted.length === 0 ? "none new" : `inserted ${inserted.join(", ")}`}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    const r = await pool.query<{ t: string; n: number }>(
      `SELECT 'knowledge_categories' AS t, count(*)::int AS n FROM knowledge_categories
       UNION ALL SELECT 'relationship_types', count(*)::int FROM relationship_types
       UNION ALL SELECT 'event_types', count(*)::int FROM event_types
       UNION ALL SELECT 'assessments (instruments, not demo)', count(*)::int FROM assessments WHERE kind = 'questionnaire' AND NOT is_demo`,
    );
    for (const row of r.rows) log(`  ${row.t.padEnd(36)} ${row.n}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:seed:reference] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
