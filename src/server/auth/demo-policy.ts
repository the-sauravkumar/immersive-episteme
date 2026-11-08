import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { studies } from "@db/schema/study";

export type PublicDemoMode = "auto" | "on" | "off";

export function publicDemoAllowed(mode: PublicDemoMode, realStudyActive: boolean): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return !realStudyActive;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

export async function realStudyActive(db: AnyPgDatabase): Promise<boolean> {
  const rows = await db
    .select({ id: studies.id })
    .from(studies)
    .where(and(eq(studies.status, "active"), eq(studies.isDemo, false)))
    .limit(1);
  return rows.length > 0;
}

export function publicDemoGate(db: () => AnyPgDatabase, mode: PublicDemoMode): () => Promise<boolean> {
  return async () => (mode === "auto" ? publicDemoAllowed(mode, await realStudyActive(db())) : publicDemoAllowed(mode, false));
}
