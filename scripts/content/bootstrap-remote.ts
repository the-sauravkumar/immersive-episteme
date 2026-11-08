import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EVENT_TYPE_REGISTRY, KNOWLEDGE_CATEGORIES, RELATIONSHIP_TYPES } from "../../db/seeds/reference-data";
import { MIGRATIONS_FOLDER, makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { buildPublicDemo, counts } from "./public-demo";
import { decideBootstrapTarget, missingReferenceCodes, pendingMigrations } from "./remote-guard";

const log = (msg: string) => console.log(`[content:bootstrap:remote] ${msg}`);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { url } = resolveDatabaseUrl([]);
  const decision = decideBootstrapTarget(url, argv);
  log(decision.message);
  if (!decision.ok) process.exit(2);
  log(`connecting to ${redact(url)}`);

  const pool = makePool(url);
  const client = await pool.connect();
  try {
    const journal = JSON.parse(readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as { entries: unknown[] };
    const applied = await client
      .query<{ n: number }>("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations")
      .then((r) => r.rows[0]?.n ?? 0)
      .catch(() => 0);
    const pending = pendingMigrations(journal.entries.length, applied);
    if (pending > 0) throw new Error(`${pending} migration(s) pending (${applied} of ${journal.entries.length} applied). Run db:migrate first.`);

    const present = async (table: string) => (await client.query<{ code: string }>(`SELECT code FROM ${table}`)).rows.map((r) => r.code);
    const missing = missingReferenceCodes(
      {
        eventTypes: EVENT_TYPE_REGISTRY.map((e) => e.code),
        relationshipTypes: RELATIONSHIP_TYPES.map((t) => t.code),
        knowledgeCategories: KNOWLEDGE_CATEGORIES.map((c) => c.code),
      },
      { eventTypes: await present("event_types"), relationshipTypes: await present("relationship_types"), knowledgeCategories: await present("knowledge_categories") },
    );
    if (missing.length > 0) {
      throw new Error(`Reference data missing (${missing.length}, e.g. ${missing.slice(0, 3).join(", ")}). Run db:seed:reference first.`);
    }
    log(`schema current (${applied} migrations), reference data present`);

    await buildPublicDemo(client, { invokedBy: "npm run content:bootstrap:remote", log });

    log("row counts:");
    for (const [t, n] of Object.entries(await counts(client))) log(`  ${t.padEnd(26)} ${n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[content:bootstrap:remote] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
