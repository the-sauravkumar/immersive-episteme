/**
 * Participant study-session cookie. Participants never get a Better Auth account: their
 * identity is a pseudonymous participant id + study session id + assigned condition, carried
 * in a signed, httpOnly cookie and re-validated against `study_sessions` on every guard check
 * (see ./learning-decision.ts). Pure sign/verify lives in ./participant-session-token.ts.
 */
import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

import { PARTICIPANT_COOKIE, SECURE_COOKIES } from "./cookie-names";
import {
  PARTICIPANT_SESSION_TTL_SECONDS,
  signParticipantSession,
  type ParticipantSessionInput,
} from "./participant-session-token";

export * from "./participant-session-token";

// ---- cookie helpers (request scope) ---------------------------------------------------------

/**
 * Set the participant cookie. Call only from a Server Action or Route Handler, after the study
 * engine has created/resumed the `study_sessions` row and recorded the condition assignment.
 */
export async function issueParticipantSessionCookie(
  input: ParticipantSessionInput,
  opts: { ttlSeconds?: number } = {},
): Promise<void> {
  const ttl = opts.ttlSeconds ?? PARTICIPANT_SESSION_TTL_SECONDS;
  const token = await signParticipantSession(input, serverEnv().BETTER_AUTH_SECRET, { ttlSeconds: ttl });
  (await cookies()).set(PARTICIPANT_COOKIE, token, {
    httpOnly: true,
    secure: SECURE_COOKIES,
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}

export async function clearParticipantSessionCookie(): Promise<void> {
  (await cookies()).delete({ name: PARTICIPANT_COOKIE, path: "/" });
}

/** Raw cookie value (or undefined). Callers must verify it. */
export async function readParticipantCookie(): Promise<string | undefined> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value;
}
