/**
 * Drizzle implementation of the StudySessionLookup port (./study-session-port.ts) over
 * `study_sessions` + `study_conditions` (assigned interface) + `participants` (status).
 *
 * Not `server-only` so integration tests can run it against `episteme_test`; app code reaches
 * it through `getStudySessionLookup()`.
 *
 * A session id that is not a uuid can never exist, so it short-circuits to null instead of
 * letting Postgres raise `invalid input syntax for type uuid`.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { participants, studyConditions, studySessions } from "@db/schema/study";

import { conditionFromInterface, type StudySessionLookup, type StudySessionRecord } from "./study-session-port-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function drizzleStudySessionLookup(db: AnyPgDatabase): StudySessionLookup {
  return {
    async findSession(sessionId: string): Promise<StudySessionRecord | null> {
      if (!UUID_RE.test(sessionId)) return null;
      const [row] = await db
        .select({
          sessionId: studySessions.id,
          participantId: studySessions.participantId,
          status: studySessions.status,
          withdrawn: studySessions.withdrawn,
          conditionInterface: studyConditions.interface,
          participantStatus: participants.status,
        })
        .from(studySessions)
        .innerJoin(studyConditions, eq(studyConditions.id, studySessions.conditionId))
        .innerJoin(participants, eq(participants.id, studySessions.participantId))
        .where(eq(studySessions.id, sessionId))
        .limit(1);
      if (!row) return null;
      return {
        sessionId: row.sessionId,
        participantId: row.participantId,
        condition: conditionFromInterface(row.conditionInterface),
        status: row.status,
        participantStatus: row.participantStatus,
        withdrawn: row.withdrawn,
      };
    },
  };
}
