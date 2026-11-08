"use server";
import { cookies } from "next/headers";

import type { SaveResult } from "@/components/assessment/concept-map-editor";
import { serverEnv } from "@/lib/env";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession } from "@/server/auth/learning-decision";
import { getStudySessionLookup } from "@/server/auth/study-session-port";
import { getPool } from "@/server/db/client";
import { currentReconstructionPhase } from "@/server/study/engine";

import { AssessmentError } from "./common";
import { saveParticipantMap } from "./participant-maps";

export async function saveReconstructionMap(itemId: string, payload: unknown, final: boolean): Promise<SaveResult> {
  const jar = await cookies();
  const decision = await resolveParticipantSession(jar.get(PARTICIPANT_COOKIE)?.value, {
    secret: serverEnv().BETTER_AUTH_SECRET,
    lookup: getStudySessionLookup(),
  });
  if (!decision.allowed) return { ok: false, error: "Your study session has ended. Ask the study facilitator." };
  if (typeof itemId !== "string" || typeof final !== "boolean") return { ok: false, error: "Invalid request." };
  try {
    const { participantId, sessionId } = decision.participant;
    await saveParticipantMap(getPool(), { participantId, sessionId }, { itemId, payload, final }, { currentPhase: (client) => currentReconstructionPhase(client, sessionId) });
    return { ok: true };
  } catch (err) {
    if (err instanceof AssessmentError) return { ok: false, error: err.message };
    console.error("[assessment] saving a concept map failed", err);
    return { ok: false, error: "The map could not be saved. Try again or ask the study facilitator." };
  }
}
