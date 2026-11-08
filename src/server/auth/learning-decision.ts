import { can, type Subject } from "@/lib/permissions/can";
import { LEARNING_PERMISSION, type LearningCondition } from "@/lib/permissions/learning";
import { isStaffRole } from "@/lib/permissions/roles";

import { verifyDemoSession } from "./demo-session";
import { verifyParticipantSession } from "./participant-session-token";
import {
  ACTIVE_PARTICIPANT_STATUSES,
  LEARNING_SESSION_STATUSES,
  type StudySessionLookup,
} from "./study-session-port-types";

export type LearningAccess =
  | {
      kind: "participant";
      experimental: true;
      condition: LearningCondition;
      participantId: string;
      sessionId: string;
    }
  | { kind: "demo"; experimental: false; condition: LearningCondition; demoId: string }
  | { kind: "staff_preview"; experimental: false; condition: LearningCondition; userId: string };

type LearningDenyReason =
  | "condition_mismatch"
  | "invalid_participant_session"
  | "session_not_active"
  | "session_not_started"
  | "demo_unavailable"
  | "no_access";

export type LearningDecision =
  | { allowed: true; access: LearningAccess }
  | { allowed: false; reason: LearningDenyReason; redirectTo: string };

const LEARNING_DENY_REDIRECT: Record<LearningDenyReason, string> = {
  condition_mismatch: "/study/session",
  invalid_participant_session: "/study/exit?reason=invalid-session",
  session_not_active: "/study/exit?reason=session-ended",
  session_not_started: "/study/session",
  demo_unavailable: "/explore?demo=unavailable",
  no_access: "/study",
};

export type LearningAccessInput = {
  condition: LearningCondition;
  participantCookie: string | undefined;
  demoCookie: string | undefined;
  staff: () => Promise<(Subject & { userId: string }) | null>;
};

export type LearningAccessDeps = {
  secret: string;
  lookup: StudySessionLookup;
  now?: number;
  demoEnabled?: () => Promise<boolean>;
};

const deny = (reason: LearningDenyReason): LearningDecision => ({
  allowed: false,
  reason,
  redirectTo: LEARNING_DENY_REDIRECT[reason],
});

export async function resolveLearningAccess(
  input: LearningAccessInput,
  deps: LearningAccessDeps,
): Promise<LearningDecision> {
  const { condition } = input;

  if (input.participantCookie !== undefined) {
    const verified = await verifyParticipantSession(input.participantCookie, deps.secret, { now: deps.now });
    if (!verified.ok) return deny("invalid_participant_session");
    const claims = verified.claims;

    const record = await deps.lookup.findSession(claims.sessionId);
    if (!record || record.participantId !== claims.participantId) return deny("invalid_participant_session");
    if (record.withdrawn || record.excluded || !ACTIVE_PARTICIPANT_STATUSES.includes(record.participantStatus)) {
      return deny("session_not_active");
    }
    if (record.status === "scheduled") return deny("session_not_started");
    if (!LEARNING_SESSION_STATUSES.includes(record.status)) return deny("session_not_active");
    if (record.condition === null || claims.condition === null) return deny("condition_mismatch");
    if (record.condition !== claims.condition) return deny("invalid_participant_session");
    if (claims.condition !== condition) return deny("condition_mismatch");

    return {
      allowed: true,
      access: {
        kind: "participant",
        experimental: true,
        condition,
        participantId: claims.participantId,
        sessionId: claims.sessionId,
      },
    };
  }

  const staff = await input.staff();
  if (staff && staff.roles.some(isStaffRole) && can(staff, LEARNING_PERMISSION[condition])) {
    return { allowed: true, access: { kind: "staff_preview", experimental: false, condition, userId: staff.userId } };
  }

  if (input.demoCookie !== undefined) {
    const verified = await verifyDemoSession(input.demoCookie, deps.secret, { now: deps.now });
    if (verified.ok) {
      if (deps.demoEnabled && !(await deps.demoEnabled())) return deny("demo_unavailable");
      return {
        allowed: true,
        access: { kind: "demo", experimental: false, condition, demoId: verified.claims.demoId },
      };
    }
  }

  return deny("no_access");
}

export type ParticipantContext = {
  participantId: string;
  sessionId: string;
  condition: LearningCondition | null;
};

const REISSUE_AFTER_ALLOCATION_PATH = "/study/allocate";

export type ParticipantDecision =
  | { allowed: true; participant: ParticipantContext }
  | { allowed: false; redirectTo: string };

export async function resolveParticipantSession(
  participantCookie: string | undefined,
  deps: LearningAccessDeps,
): Promise<ParticipantDecision> {
  return resolveSessionCookie(participantCookie, deps, "take_part");
}

export async function resolveWithdrawalSession(
  participantCookie: string | undefined,
  deps: LearningAccessDeps,
): Promise<ParticipantDecision> {
  return resolveSessionCookie(participantCookie, deps, "withdraw");
}

async function resolveSessionCookie(
  participantCookie: string | undefined,
  deps: LearningAccessDeps,
  purpose: "take_part" | "withdraw",
): Promise<ParticipantDecision> {
  if (participantCookie === undefined) return { allowed: false, redirectTo: "/study" };
  const verified = await verifyParticipantSession(participantCookie, deps.secret, { now: deps.now });
  if (!verified.ok) return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  const record = await deps.lookup.findSession(verified.claims.sessionId);
  if (!record || record.participantId !== verified.claims.participantId) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  }
  const allocatedSince = verified.claims.condition === null && record.condition !== null;
  if (record.condition !== verified.claims.condition && !allocatedSince) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  }
  const excludedMayWithdraw = record.excluded && purpose === "withdraw" && record.participantStatus === "excluded";
  if (
    record.withdrawn ||
    (record.excluded && purpose === "take_part") ||
    (!excludedMayWithdraw && (record.status === "completed" || record.status === "abandoned" || !ACTIVE_PARTICIPANT_STATUSES.includes(record.participantStatus)))
  ) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.session_not_active };
  }
  if (allocatedSince && purpose === "take_part") return { allowed: false, redirectTo: REISSUE_AFTER_ALLOCATION_PATH };
  return {
    allowed: true,
    participant: {
      participantId: verified.claims.participantId,
      sessionId: verified.claims.sessionId,
      condition: record.condition,
    },
  };
}
