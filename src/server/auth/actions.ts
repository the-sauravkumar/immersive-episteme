"use server";
/**
 * Server actions for the public demo session. (Staff sign-in/out go through Better Auth's HTTP
 * router at /api/auth so that its rate limiting and origin checks apply.)
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { serverEnv } from "@/lib/env";
import { isLearningCondition, LEARNING_ROUTE } from "@/lib/permissions/learning";

import { DEMO_COOKIE, PARTICIPANT_COOKIE, SECURE_COOKIES } from "./cookie-names";
import { isPublicDemoEnabled } from "./demo-gate";
import { DEMO_SESSION_TTL_SECONDS, signDemoSession } from "./demo-session";
import { resolveParticipantSession } from "./learning-decision";
import { getStudySessionLookup } from "./study-session-port";

/**
 * Start (or refresh) a non-experimental demo and open the chosen condition.
 *  - A browser holding a LIVE participant session is sent back to its session, so a
 *    participant cannot use /explore to reach the condition they were not assigned.
 *  - A dead participant cookie (ended, withdrawn, tampered, expired) is deleted here instead of
 *    blocking the demo until it expires.
 *  - The server-side demo policy (./demo-policy.ts) is checked last; it is what stops a
 *    participant in another browser while a real study is running.
 */
export async function startPublicDemo(formData: FormData): Promise<void> {
  const condition = formData.get("condition");
  if (!isLearningCondition(condition)) redirect("/explore");

  const jar = await cookies();
  const secret = serverEnv().BETTER_AUTH_SECRET;
  const participantCookie = jar.get(PARTICIPANT_COOKIE)?.value;
  if (participantCookie !== undefined) {
    const live = await resolveParticipantSession(participantCookie, { secret, lookup: getStudySessionLookup() });
    if (live.allowed) redirect("/study/session");
    jar.delete({ name: PARTICIPANT_COOKIE, path: "/" });
  }

  if (!(await isPublicDemoEnabled())) redirect("/explore?demo=unavailable");

  const token = await signDemoSession(secret);
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
  (await cookies()).delete({ name: DEMO_COOKIE, path: "/" });
  redirect("/explore");
}
