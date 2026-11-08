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
