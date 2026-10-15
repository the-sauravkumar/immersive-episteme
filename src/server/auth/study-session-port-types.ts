/**
 * Types and pure helpers for the participant-session <-> `study_sessions` port. Dependency-free
 * (no `server-only`) so the Drizzle implementation and tests can import it.
 */
import type { LearningCondition } from "@/lib/permissions/learning";
import type { ConditionInterface, ParticipantStatus, SessionStatus } from "@/lib/validation/enums";

export type StudySessionRecord = {
  sessionId: string;
  participantId: string;
  /** Condition the database currently assigns this session to (authoritative); null before allocation. */
  condition: LearningCondition | null;
  status: SessionStatus;
  participantStatus: ParticipantStatus;
  /** Session withdrawn by or for the participant. Withdrawn sessions never grant access. */
  withdrawn: boolean;
};

export interface StudySessionLookup {
  /** The session by id, or null if it does not exist. */
  findSession(sessionId: string): Promise<StudySessionRecord | null>;
}

/** Session statuses during which learning pages may render. */
export const LEARNING_SESSION_STATUSES: readonly SessionStatus[] = ["in_progress"];
/** Participant statuses that may still take part. */
export const ACTIVE_PARTICIPANT_STATUSES: readonly ParticipantStatus[] = ["enrolled", "active"];

export function conditionFromInterface(value: ConditionInterface): LearningCondition;
export function conditionFromInterface(value: ConditionInterface | null): LearningCondition | null;
export function conditionFromInterface(value: ConditionInterface | null): LearningCondition | null {
  switch (value) {
    case null:
      return null;
    case "conventional_2d":
      return "2d";
    case "immersive_3d":
      return "immersive";
  }
}
