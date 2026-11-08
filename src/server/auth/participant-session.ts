import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

import { expiredCookie, PARTICIPANT_COOKIE, SECURE_COOKIES } from "./cookie-names";
import {
  PARTICIPANT_SESSION_TTL_SECONDS,
  signParticipantSession,
  type ParticipantSessionInput,
} from "./participant-session-token";

export * from "./participant-session-token";

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
  (await cookies()).set(expiredCookie(PARTICIPANT_COOKIE));
}

export async function readParticipantCookie(): Promise<string | undefined> {
  return (await cookies()).get(PARTICIPANT_COOKIE)?.value;
}
