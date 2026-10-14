/**
 * Request-bound guards for the learning routes (/learn/2d, /learn/immersive) and the
 * in-session study steps. Server-side only. The decision logic is pure and lives in
 * ./learning-decision.ts (see there for the three ways in and why a participant cookie always
 * decides). Denials redirect (throw) before any content is rendered.
 */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { serverEnv } from "@/lib/env";
import type { LearningCondition } from "@/lib/permissions/learning";

import { DEMO_COOKIE, PARTICIPANT_COOKIE } from "./cookie-names";
import { isPublicDemoEnabled } from "./demo-gate";
import {
  resolveLearningAccess,
  resolveParticipantSession,
  type LearningAccess,
  type ParticipantContext,
} from "./learning-decision";
import { getStaffPrincipal } from "./staff";
import { getStudySessionLookup } from "./study-session-port";

export * from "./learning-decision";

/**
 * Layout/page guard. Returns the access context or redirects (throws) without rendering.
 * Deduped per request. Must run inside <Suspense> (reads cookies).
 */
export const requireLearningAccess = cache(async (condition: LearningCondition): Promise<LearningAccess> => {
  const jar = await cookies();
  const decision = await resolveLearningAccess(
    {
      condition,
      participantCookie: jar.get(PARTICIPANT_COOKIE)?.value,
      demoCookie: jar.get(DEMO_COOKIE)?.value,
      staff: getStaffPrincipal,
    },
    { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup(), demoEnabled: isPublicDemoEnabled },
  );
  if (!decision.allowed) redirect(decision.redirectTo);
  return decision.access;
});

/** Guard for /study/* steps after enrolment. Must run inside <Suspense>. */
export const requireParticipantSession = cache(async (): Promise<ParticipantContext> => {
  const jar = await cookies();
  const decision = await resolveParticipantSession(jar.get(PARTICIPANT_COOKIE)?.value, {
    secret: serverEnv().BETTER_AUTH_SECRET,
    lookup: getStudySessionLookup(),
  });
  if (!decision.allowed) redirect(decision.redirectTo);
  return decision.participant;
});
