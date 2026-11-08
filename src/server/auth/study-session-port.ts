import "server-only";

import { getDb } from "@/server/db/client";

import { drizzleStudySessionLookup } from "./study-session-lookup";
import type { StudySessionLookup } from "./study-session-port-types";

export * from "./study-session-port-types";

let defaultLookup: StudySessionLookup | null = null;

export function getStudySessionLookup(): StudySessionLookup {
  defaultLookup ??= drizzleStudySessionLookup(getDb());
  return defaultLookup;
}
