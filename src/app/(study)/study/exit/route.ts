/**
 * GET /study/exit?reason=invalid-session|session-ended
 *
 * Where the participant guards send a browser whose participant cookie no longer grants
 * anything (src/server/auth/learning-decision.ts). Cookies cannot be deleted while a Server
 * Component renders, so this Route Handler does it, then shows /study with the reason.
 *
 * It re-checks the cookie first and only deletes a dead one: a cross-site link to this URL
 * cannot end a live study session (a live session is sent back to /study/session).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession } from "@/server/auth/learning-decision";
import { getStudySessionLookup } from "@/server/auth/study-session-port";

const REASONS = new Set(["invalid-session", "session-ended"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const reasonParam = request.nextUrl.searchParams.get("reason");
  const reason = reasonParam && REASONS.has(reasonParam) ? reasonParam : null;
  const jar = await cookies();
  const cookie = jar.get(PARTICIPANT_COOKIE)?.value;

  if (cookie !== undefined) {
    const live = await resolveParticipantSession(cookie, {
      secret: serverEnv().BETTER_AUTH_SECRET,
      lookup: getStudySessionLookup(),
    });
    if (live.allowed) return NextResponse.redirect(new URL("/study/session", request.url));
  }

  const target = new URL("/study", request.url);
  if (reason) target.searchParams.set("reason", reason);
  const response = NextResponse.redirect(target);
  if (cookie !== undefined) response.cookies.delete({ name: PARTICIPANT_COOKIE, path: "/" });
  return response;
}
