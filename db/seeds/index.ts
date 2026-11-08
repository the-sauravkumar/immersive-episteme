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
