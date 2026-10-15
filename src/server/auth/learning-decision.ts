/**
 * Pure access decisions for the learning conditions and in-session study pages. No request
 * APIs (cookies/headers) and no database handle: inputs are the raw cookie values, a lazy
 * staff resolver and a StudySessionLookup. The request-bound guards in ./learning-access.ts
 * feed these from the real request; tests feed them directly.
 *
 * Learning access is granted in exactly three ways:
 *  (a) participant: a valid signed study-session cookie whose condition matches the route AND
 *      whose `study_sessions` row is running, not withdrawn, belongs to that participant and is
 *      still assigned to that condition                         -> experimental: true
 *  (b) demo:  a valid signed public-demo cookie set via /explore, while the server-side demo
 *      policy allows the demo (./demo-policy.ts: off while a real study runs) -> experimental: false
 *  (c) staff: a signed-in staff member holding learn.<condition> -> experimental: false (preview)
 *
 * A participant cookie, when present, ALWAYS decides: a mismatched condition redirects to
 * /study/session and a tampered/expired/ended one is refused, even if the browser also holds a
 * demo cookie or a staff session. This keeps a participant from reaching the other condition
 * through /explore or a shared machine. (Other browsers are covered by the demo policy, which
 * is enforced here too, not only when the demo cookie is issued.)
 *
 * A dead participant cookie (tampered, expired, ended, withdrawn) is sent to /study/exit,
 * a Route Handler that deletes it (an RSC render cannot), so the browser is not stuck refusing
 * /explore and staff preview until the cookie expires.
 *
 * Staff preview requires a real staff principal. `public` and `participant` also hold learn.*
 * in the matrix, but those grants only take effect through (a) and (b): a principal without
 * a staff role never reaches (c).
 */
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

export type LearningDenyReason =
  | "condition_mismatch"
  | "invalid_participant_session"
  | "session_not_active"
  | "session_not_started"
  | "demo_unavailable"
  | "no_access";

export type LearningDecision =
  | { allowed: true; access: LearningAccess }
  | { allowed: false; reason: LearningDenyReason; redirectTo: string };

export const LEARNING_DENY_REDIRECT: Record<LearningDenyReason, string> = {
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
  /** Resolved lazily: only consulted when there is no participant cookie. */
  staff: () => Promise<(Subject & { userId: string }) | null>;
};

export type LearningAccessDeps = {
  secret: string;
  lookup: StudySessionLookup;
  /** Seconds since epoch (tests). */
  now?: number;
  /**
   * Server-side public-demo policy (./demo-policy.ts). Consulted only for a valid demo cookie.
   * Omitted = allowed (pure tests); the request-bound guard always passes the real policy.
   */
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

  // (a) Participant cookie present: it alone decides.
  if (input.participantCookie !== undefined) {
    const verified = await verifyParticipantSession(input.participantCookie, deps.secret, { now: deps.now });
    if (!verified.ok) return deny("invalid_participant_session");
    const claims = verified.claims;

    const record = await deps.lookup.findSession(claims.sessionId);
    if (!record || record.participantId !== claims.participantId) return deny("invalid_participant_session");
    if (record.withdrawn || !ACTIVE_PARTICIPANT_STATUSES.includes(record.participantStatus)) {
      return deny("session_not_active");
    }
    if (record.status === "scheduled") return deny("session_not_started");
    if (!LEARNING_SESSION_STATUSES.includes(record.status)) return deny("session_not_active");
    // Not allocated yet (allocation after the pre-test), or allocated after this cookie was
    // issued: back to the session, which re-issues the cookie with the condition.
    if (record.condition === null || claims.condition === null) return deny("condition_mismatch");
    // The database assignment is authoritative; the cookie claim must agree with it.
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

  // (c) Staff preview: only a principal holding at least one staff role.
  const staff = await input.staff();
  if (staff && staff.roles.some(isStaffRole) && can(staff, LEARNING_PERMISSION[condition])) {
    return { allowed: true, access: { kind: "staff_preview", experimental: false, condition, userId: staff.userId } };
  }

  // (b) Public demo.
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

// ---- participant-only study pages -----------------------------------------------------------

export type ParticipantContext = {
  participantId: string;
  sessionId: string;
  /** null before allocation (allocation after the pre-test). */
  condition: LearningCondition | null;
};

/** Where a cookie issued before allocation goes once the session has been allocated. */
export const REISSUE_AFTER_ALLOCATION_PATH = "/study/allocate";

export type ParticipantDecision =
  | { allowed: true; participant: ParticipantContext }
  | { allowed: false; redirectTo: string };

/** Does this cookie represent a live (scheduled or running) study session, any condition? */
export async function resolveParticipantSession(
  participantCookie: string | undefined,
  deps: LearningAccessDeps,
): Promise<ParticipantDecision> {
  if (participantCookie === undefined) return { allowed: false, redirectTo: "/study" };
  const verified = await verifyParticipantSession(participantCookie, deps.secret, { now: deps.now });
  if (!verified.ok) return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  const record = await deps.lookup.findSession(verified.claims.sessionId);
  if (!record || record.participantId !== verified.claims.participantId) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  }
  // A cookie issued before allocation for a session that has since been allocated: re-issue it.
  const allocatedSince = verified.claims.condition === null && record.condition !== null;
  if (record.condition !== verified.claims.condition && !allocatedSince) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.invalid_participant_session };
  }
  if (
    record.withdrawn ||
    record.status === "completed" ||
    record.status === "abandoned" ||
    !ACTIVE_PARTICIPANT_STATUSES.includes(record.participantStatus)
  ) {
    return { allowed: false, redirectTo: LEARNING_DENY_REDIRECT.session_not_active };
  }
  if (allocatedSince) return { allowed: false, redirectTo: REISSUE_AFTER_ALLOCATION_PATH };
  return {
    allowed: true,
    participant: {
      participantId: verified.claims.participantId,
      sessionId: verified.claims.sessionId,
      condition: verified.claims.condition,
    },
  };
}
