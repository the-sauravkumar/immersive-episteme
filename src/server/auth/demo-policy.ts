/**
 * Server-side switch for the public demo (/explore -> both learning conditions).
 *
 * The demo shows BOTH conditions, so while a real study is running it is a way for a
 * prospective or current participant to preview the condition they were not assigned
 * (a private window or a second browser defeats any cookie-based rule). The policy is therefore
 * enforced on the server, where it cannot be bypassed: by `startPublicDemo` (no demo cookie is
 * issued) and by the demo branch of the learning guard (an existing demo cookie stops working).
 *
 * PUBLIC_DEMO (src/lib/env.ts):
 *  - "auto" (default): off while any non-demo study is `active`;
 *  - "off": always off;  "on": always on (e.g. a public exhibition with no study running).
 *
 * Not `server-only` so integration tests can run the Drizzle check against episteme_test.
 */
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { studies } from "@db/schema/study";

export type PublicDemoMode = "auto" | "on" | "off";

/** Pure decision. */
export function publicDemoAllowed(mode: PublicDemoMode, realStudyActive: boolean): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return !realStudyActive;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

/** Is any non-demo study currently collecting data? */
export async function realStudyActive(db: AnyPgDatabase): Promise<boolean> {
  const rows = await db
    .select({ id: studies.id })
    .from(studies)
    .where(and(eq(studies.status, "active"), eq(studies.isDemo, false)))
    .limit(1);
  return rows.length > 0;
}

/** The gate the guards and actions call. Only queries the database in "auto" mode. */
export function publicDemoGate(db: () => AnyPgDatabase, mode: PublicDemoMode): () => Promise<boolean> {
  return async () => (mode === "auto" ? publicDemoAllowed(mode, await realStudyActive(db())) : publicDemoAllowed(mode, false));
}
