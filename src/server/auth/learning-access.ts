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
  resolveWithdrawalSession,
  type LearningAccess,
  type ParticipantContext,
} from "./learning-decision";
import { getStaffPrincipal } from "./staff";
import { getStudySessionLookup } from "./study-session-port";

export * from "./learning-decision";

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

export const requireParticipantSession = cache(async (): Promise<ParticipantContext> => {
  const jar = await cookies();
  const decision = await resolveParticipantSession(jar.get(PARTICIPANT_COOKIE)?.value, {
    secret: serverEnv().BETTER_AUTH_SECRET,
    lookup: getStudySessionLookup(),
  });
  if (!decision.allowed) redirect(decision.redirectTo);
  return decision.participant;
});

export const requireWithdrawalSession = cache(async (): Promise<ParticipantContext> => {
  const jar = await cookies();
  const decision = await resolveWithdrawalSession(jar.get(PARTICIPANT_COOKIE)?.value, {
    secret: serverEnv().BETTER_AUTH_SECRET,
    lookup: getStudySessionLookup(),
  });
  if (!decision.allowed) redirect(decision.redirectTo);
  return decision.participant;
});
