import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { serverEnv } from "@/lib/env";
import { expiredCookie, PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession, resolveWithdrawalSession } from "@/server/auth/learning-decision";
import { getStudySessionLookup } from "@/server/auth/study-session-port";

const REASONS = new Set(["invalid-session", "session-ended"]);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const reasonParam = request.nextUrl.searchParams.get("reason");
  const reason = reasonParam && REASONS.has(reasonParam) ? reasonParam : null;
  const jar = await cookies();
  const cookie = jar.get(PARTICIPANT_COOKIE)?.value;

  const deps = { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup() };
  if (cookie !== undefined && (await resolveParticipantSession(cookie, deps)).allowed) {
    return NextResponse.redirect(new URL("/study/session", request.url));
  }
  const withdrawable = cookie !== undefined && (await resolveWithdrawalSession(cookie, deps)).allowed;

  const target = new URL("/study", request.url);
  if (reason) target.searchParams.set("reason", reason);
  const response = NextResponse.redirect(target);
  if (cookie !== undefined && !withdrawable) response.cookies.set(expiredCookie(PARTICIPANT_COOKIE));
  return response;
}
