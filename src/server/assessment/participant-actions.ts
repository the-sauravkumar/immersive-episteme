"use server";
/**
 * Participant server action for the reconstruction task. The participant and session come only
 * from the verified participant cookie (re-checked against `study_sessions` on every call); the
 * client sends the item it was shown and the editor payload, nothing else.
 */
import { cookies } from "next/headers";

import type { SaveResult } from "@/components/assessment/concept-map-editor";
import { serverEnv } from "@/lib/env";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession } from "@/server/auth/learning-decision";
import { getStudySessionLookup } from "@/server/auth/study-session-port";
import { getPool } from "@/server/db/client";

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
    await saveParticipantMap(getPool(), { participantId, sessionId }, { itemId, payload, final });
    return { ok: true };
  } catch (err) {
    if (err instanceof AssessmentError) return { ok: false, error: err.message };
    console.error("[assessment] saving a concept map failed", err);
    return { ok: false, error: "The map could not be saved. Try again or ask the study facilitator." };
  }
}
