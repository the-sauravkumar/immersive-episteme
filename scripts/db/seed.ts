/**
 * Runs the registered seeds in db/seeds/index.ts (demo data only — see the rules there).
 *   npm run db:seed            -> DATABASE_URL
 *   npm run db:seed -- --test  -> TEST_DATABASE_URL
 */
import { drizzle } from "drizzle-orm/node-postgres";

import { seeds } from "../../db/seeds";
import { makePool, redact, resolveDatabaseUrl } from "./_shared";

async function main(): Promise<void> {
  const { url, label } = resolveDatabaseUrl();
  const pool = makePool(url);
  try {
    console.log(`[db:seed] ${label} database ${redact(url)}`);
    if (seeds.length === 0) {
      console.log("[db:seed] no seeds registered yet (db/seeds/index.ts)");
      return;
    }
    const db = drizzle(pool, { casing: "snake_case" });
    for (const seed of seeds) {
      const t = Date.now();
      await seed.run(db);
      console.log(`[db:seed] ${seed.name} ok (${Date.now() - t}ms)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[db:seed] failed:", err);
  process.exit(1);
});
