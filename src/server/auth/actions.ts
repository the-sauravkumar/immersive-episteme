"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env";
import { LEARNING_ROUTE } from "@/lib/permissions/learning";
import { requireSiteAccess } from "@/server/access/site-access";

import { DEMO_COOKIE, expiredCookie, PARTICIPANT_COOKIE, SECURE_COOKIES } from "./cookie-names";
import { isPublicDemoEnabled } from "./demo-gate";
import { DEMO_SESSION_TTL_SECONDS, drawDemoCondition, signDemoSession, verifyDemoSession } from "./demo-session";
import { resolveParticipantSession } from "./learning-decision";
import { getStudySessionLookup } from "./study-session-port";

export async function startPublicDemo(): Promise<void> {
  await requireSiteAccess("/explore");

  const jar = await cookies();
  const secret = serverEnv().BETTER_AUTH_SECRET;
  const participantCookie = jar.get(PARTICIPANT_COOKIE)?.value;
  if (participantCookie !== undefined) {
    const live = await resolveParticipantSession(participantCookie, { secret, lookup: getStudySessionLookup() });
    if (live.allowed) redirect("/study/session");
    jar.set(expiredCookie(PARTICIPANT_COOKIE));
  }

  if (!(await isPublicDemoEnabled())) redirect("/explore?demo=unavailable");

  const current = jar.get(DEMO_COOKIE)?.value;
  const held = current === undefined ? null : await verifyDemoSession(current, secret);
  const condition = held?.ok ? held.claims.condition : drawDemoCondition();
  const token = await signDemoSession(secret, condition);
  jar.set(DEMO_COOKIE, token, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: DEMO_SESSION_TTL_SECONDS,
  });
  redirect(LEARNING_ROUTE[condition]);
}

export async function endPublicDemo(): Promise<void> {
  (await cookies()).set(expiredCookie(DEMO_COOKIE));
  redirect("/explore");
}
