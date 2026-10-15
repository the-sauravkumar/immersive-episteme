/**
 * GET /study/allocate: allocation after the condition-blind steps (study decision D3).
 *
 * The session hub sends the participant here when the blind steps are done and the session has
 * no condition yet. A Route Handler, because allocation must re-issue the signed participant
 * cookie with the condition (an RSC render cannot set cookies). It is idempotent: an allocated
 * session only gets its cookie re-issued. The participant is identified from the signed cookie
 * and the database, never from the request. A protocol error (the stratum score cannot be
 * computed) is shown on the hub, never silently bypassed.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { PARTICIPANT_COOKIE, SECURE_COOKIES } from "@/server/auth/cookie-names";
import { PARTICIPANT_SESSION_TTL_SECONDS, signParticipantSession, verifyParticipantSession } from "@/server/auth/participant-session-token";
import { getStudySessionLookup } from "@/server/auth/study-session-port";
import { getPool } from "@/server/db/client";
import { allocateSession, StudyEngineError } from "@/server/study/engine";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const cookie = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (cookie === undefined) return to("/study");
  const secret = serverEnv().BETTER_AUTH_SECRET;
  const verified = await verifyParticipantSession(cookie, secret);
  if (!verified.ok) return to("/study/exit?reason=invalid-session");
  const record = await getStudySessionLookup().findSession(verified.claims.sessionId);
  if (!record || record.participantId !== verified.claims.participantId) return to("/study/exit?reason=invalid-session");
  if (record.withdrawn || record.status === "completed" || record.status === "abandoned") return to("/study/exit?reason=session-ended");
  if (verified.claims.condition !== null && verified.claims.condition !== record.condition) return to("/study/exit?reason=invalid-session");

  let condition = record.condition;
  if (condition === null) {
    try {
      condition = (await allocateSession(getPool(), record.sessionId)).condition;
    } catch (err) {
      if (err instanceof StudyEngineError && err.code === "allocation_refused") return to("/study/session?allocation=refused");
      if (err instanceof StudyEngineError && err.code === "not_current_step") return to("/study/session");
      throw err;
    }
  }
  const response = to("/study/session");
  if (verified.claims.condition !== condition) {
    const token = await signParticipantSession({ participantId: record.participantId, sessionId: record.sessionId, condition }, secret);
    response.cookies.set(PARTICIPANT_COOKIE, token, { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/", maxAge: PARTICIPANT_SESSION_TTL_SECONDS });
  }
  return response;
}
