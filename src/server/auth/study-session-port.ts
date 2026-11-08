import "server-only";

import { getDb } from "@/server/db/client";

import { drizzleStudySessionLookup } from "./study-session-lookup";
import type { StudySessionLookup } from "./study-session-port-types";

export * from "./study-session-port-types";

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

export function setStudySessionLookupForTesting(lookup: StudySessionLookup | null): void {
  override = lookup;
}
