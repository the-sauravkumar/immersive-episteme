import type { LearningCondition } from "@/lib/permissions/learning";
import type { ConditionInterface, ParticipantStatus, SessionStatus } from "@/lib/validation/enums";

export type StudySessionRecord = {
  sessionId: string;
  participantId: string;
  condition: LearningCondition | null;
  status: SessionStatus;
  participantStatus: ParticipantStatus;
  withdrawn: boolean;
  excluded: boolean;
};

export interface StudySessionLookup {
  findSession(sessionId: string): Promise<StudySessionRecord | null>;
}

export const LEARNING_SESSION_STATUSES: readonly SessionStatus[] = ["in_progress"];
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
