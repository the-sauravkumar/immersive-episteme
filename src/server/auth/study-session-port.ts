/**
 * Port between the participant-session guard and the study engine's `study_sessions` table.
 *
 * The cookie alone is never trusted for learning access: every guard check also asks the
 * database whether the session still exists, belongs to that participant, is running, is not
 * withdrawn, and is still assigned to the cookie's condition (a reassignment, withdrawal or
 * participant exclusion takes effect at once).
 *
 * The default lookup is the Drizzle implementation in ./study-session-lookup.ts over the app
 * database. Tests swap it with `setStudySessionLookupForTesting()`. `unwiredStudySessionLookup`
 * is kept as a fail-closed stand-in (it denies every participant).
 */
import "server-only";

import { getDb } from "@/server/db/client";

import { drizzleStudySessionLookup } from "./study-session-lookup";
import type { StudySessionLookup } from "./study-session-port-types";

export * from "./study-session-port-types";

/** Fail-closed lookup: no session exists. */
export const unwiredStudySessionLookup: StudySessionLookup = {
  async findSession() {
    return null;
  },
};

let override: StudySessionLookup | null = null;
let defaultLookup: StudySessionLookup | null = null;

export function getStudySessionLookup(): StudySessionLookup {
  if (override) return override;
  defaultLookup ??= drizzleStudySessionLookup(getDb());
  return defaultLookup;
}

/** Tests only: swap the lookup (pass null to restore the default). */
export function setStudySessionLookupForTesting(lookup: StudySessionLookup | null): void {
  override = lookup;
}
