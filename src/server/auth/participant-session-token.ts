import { z } from "zod";

import { LEARNING_CONDITIONS, type LearningCondition } from "@/lib/permissions/learning";

import { signToken, verifyToken } from "./signed-token";

export const PARTICIPANT_SESSION_PURPOSE = "participant-session/v1";
export const PARTICIPANT_SESSION_TTL_SECONDS = 60 * 60 * 6;

const opaqueId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "opaque id");

const claimsSchema = z
  .object({
    t: z.literal("participant"),
    pid: opaqueId,
    sid: opaqueId,
    cond: z.enum(LEARNING_CONDITIONS).nullable(),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export type ParticipantSessionClaims = {
  participantId: string;
  sessionId: string;
  condition: LearningCondition | null;
  issuedAt: number;
  expiresAt: number;
};

export type ParticipantSessionInput = {
  participantId: string;
  sessionId: string;
  condition: LearningCondition | null;
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function signParticipantSession(
  input: ParticipantSessionInput,
  secret: string,
  opts: { now?: number; ttlSeconds?: number } = {},
): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  const claims = claimsSchema.parse({
    t: "participant",
    pid: input.participantId,
    sid: input.sessionId,
    cond: input.condition,
    iat,
    exp: iat + (opts.ttlSeconds ?? PARTICIPANT_SESSION_TTL_SECONDS),
  });
  return signToken(claims, secret, PARTICIPANT_SESSION_PURPOSE);
}

export type ParticipantVerifyResult =
  | { ok: true; claims: ParticipantSessionClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "invalid_claims" | "expired" };

export async function verifyParticipantSession(
  token: string,
  secret: string,
  opts: { now?: number } = {},
): Promise<ParticipantVerifyResult> {
  const verified = await verifyToken(token, secret, PARTICIPANT_SESSION_PURPOSE);
  if (!verified.ok) return verified;
  const parsed = claimsSchema.safeParse(verified.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_claims" };
  const c = parsed.data;
  const now = opts.now ?? nowSeconds();
  if (c.exp <= now || c.iat > now + 60) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { participantId: c.pid, sessionId: c.sid, condition: c.cond, issuedAt: c.iat, expiresAt: c.exp },
  };
}
