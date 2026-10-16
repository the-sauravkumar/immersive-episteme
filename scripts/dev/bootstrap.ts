/**
 * Development bootstrap: one command that leaves the local database with real data for every
 * later work stream.
 *
 *   npm run dev:bootstrap     (runs `docker compose up -d --wait` first, see package.json)
 *
 * Steps (all idempotent; safe to re-run after content changes):
 *  1. migrate the main and the test database;
 *  2. seed reference data and the demo dataset (db/seeds);
 *  3. import content/ (src/server/content/import-content.ts);
 *  4. build the REVIEW snapshot from the database (kind 'review', draft, never publishable);
 *  5. compile spatial manifests from it: the three shortlisted traditions together (the demo
 *     museum) and each of them alone;
 *  6. create / update the demo study `demo-review-walkthrough` pinned to that snapshot and the
 *     combined manifest: is_demo, config.nonExperimental, stays in draft (a review snapshot can
 *     never be published, so no study can be activated on it). The demo and staff preview of
 *     /learn/* use it to pick the manifest and the traditions (src/server/learning/context-data.ts).
 *
 * Steps 3-6 live in scripts/content/public-demo.ts, shared with `npm run content:bootstrap:remote`
 * (production: no migrations of a test database, no demo seed, no users).
 *
 * Refuses to run against a non-local database. Prints the real row counts at the end.
 */
import { drizzle } from "drizzle-orm/node-postgres";

import { seeds } from "../../db/seeds";
import { buildPublicDemo, counts } from "../content/public-demo";
import { isLocalHost, makePool, redact, runMigrations } from "../db/_shared";

export { DEMO_REVIEW_STUDY_SLUG, SHORTLIST } from "../content/public-demo";

const log = (msg: string) => console.log(`[dev:bootstrap] ${msg}`);

async function main(): Promise<void> {
  const mainUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!mainUrl) throw new Error("DATABASE_URL is not set. Copy .env.example to .env (see README).");
  for (const u of [mainUrl, testUrl].filter((x): x is string => !!x)) {
    if (!isLocalHost(u)) throw new Error(`Refusing to bootstrap a non-local database: ${redact(u)}`);
  }

  if (testUrl) {
    const testPool = makePool(testUrl);
    try {
      log(`test database ${redact(testUrl)}: ${await runMigrations(testPool)}`);
    } finally {
      await testPool.end();
    }
  }

  const pool = makePool(mainUrl);
  const client = await pool.connect();
  try {
    log(`main database ${redact(mainUrl)}: ${await runMigrations(pool)}`);
    const db = drizzle(pool, { casing: "snake_case" });
    for (const seed of seeds) {
      await seed.run(db);
      log(`seed ${seed.name} ok`);
    }

    await buildPublicDemo(client, { invokedBy: "npm run dev:bootstrap", log });

    log("row counts:");
    for (const [t, n] of Object.entries(await counts(client))) log(`  ${t.padEnd(26)} ${n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[dev:bootstrap] failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
