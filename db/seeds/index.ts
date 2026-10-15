/**
 * Seed registry, run in order by `npm run db:seed`. Each seed is idempotent and receives a
 * Drizzle handle.
 *
 *  1. reference — knowledge categories, relationship-type registry, telemetry event types.
 *     Vocabulary, not content; needed by real and demo data alike.
 *  2. demo — the DEMO dataset (db/seeds/demo.ts).
 *  3. instruments — questionnaire instrument definitions (study decision D7): real, source-cited
 *     instruments, NOT demo and NOT craft content. Items are seeded only with wording verified
 *     verbatim against the stated source page; unverified items stay pending and unshowable
 *     (src/server/study/instruments.ts). Drafts: the researchers lock them.
 *
 * RULE: every seeded record that is not real, source-cited content MUST be flagged
 * is_demo = true and titled "Demo: ...". Demo records can never be published into a non-demo
 * snapshot or study (composite is_demo foreign keys and the migration 0003 triggers enforce
 * this; tests/integration/schema-*.test.ts prove it). Real craft content arrives only via the
 * content importer (content/ -> verification_state 'under_review'), never via seeds.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { Pool } from "pg";

import { seedInstrumentDefinitions } from "../../src/server/study/instruments";
import { seedDemo } from "./demo";
import { seedReferenceData } from "./reference";

export type Seed = {
  name: string;
  run: (db: NodePgDatabase) => Promise<void>;
};

export const seeds: Seed[] = [
  { name: "reference", run: seedReferenceData },
  { name: "demo", run: seedDemo },
  {
    name: "instruments",
    run: async (db) => {
      await seedInstrumentDefinitions((db as unknown as { $client: Pool }).$client);
    },
  },
];
