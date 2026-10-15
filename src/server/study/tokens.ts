/**
 * Signed tokens of the study engine (pure; secret passed explicitly). Both use the shared
 * HMAC token format (src/server/auth/signed-token.ts) under their OWN purpose keys, so neither
 * can pass as the participant-session cookie (`participant-session/v1`) or the demo cookie.
 *
 *  - Enrolment token (`study-enrolment/v1`): the short window between entering the study code
 *    and the consent decision, before any study session exists. Claims: participant id + study
 *    id. It grants nothing but the consent page of that participant.
 *  - Participation history (`study-history/v1`): which studies this browser has enrolled in
 *    (study id -> participant id), used only to detect repeat enrolment. Pseudonymous ids only.
 */
import { z } from "zod";

import { signToken, verifyToken } from "@/server/auth/signed-token";

export const ENROLMENT_PURPOSE = "study-enrolment/v1";
export const HISTORY_PURPOSE = "study-history/v1";
/** Time to read the information sheet and decide. */
export const ENROLMENT_TTL_SECONDS = 60 * 60 * 2;
/** Long enough to span a data-collection period (CN-23: about two weeks of main study). */
export const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 180;
export const HISTORY_MAX_ENTRIES = 20;

const uuid = z.uuid();
const nowSeconds = () => Math.floor(Date.now() / 1000);

const enrolmentClaims = z.strictObject({
  t: z.literal("enrolment"),
  pid: uuid,
  st: uuid,
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

export interface EnrolmentClaims {
  participantId: string;
  studyId: string;
}

export async function signEnrolment(c: EnrolmentClaims, secret: string, opts: { now?: number } = {}): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  return signToken(enrolmentClaims.parse({ t: "enrolment", pid: c.participantId, st: c.studyId, iat, exp: iat + ENROLMENT_TTL_SECONDS }), secret, ENROLMENT_PURPOSE);
}

export async function verifyEnrolment(token: string | undefined, secret: string, opts: { now?: number } = {}): Promise<EnrolmentClaims | null> {
  if (!token) return null;
  const v = await verifyToken(token, secret, ENROLMENT_PURPOSE);
  if (!v.ok) return null;
  const p = enrolmentClaims.safeParse(v.payload);
  if (!p.success) return null;
  const now = opts.now ?? nowSeconds();
  if (p.data.exp <= now || p.data.iat > now + 60) return null;
  return { participantId: p.data.pid, studyId: p.data.st };
}

const historyClaims = z.strictObject({
  t: z.literal("history"),
  e: z.array(z.tuple([uuid, uuid])).max(HISTORY_MAX_ENTRIES),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
});

/** [studyId, participantId] pairs, newest last. */
export type HistoryEntries = [string, string][];

export async function signHistory(entries: HistoryEntries, secret: string, opts: { now?: number } = {}): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  const e = entries.slice(-HISTORY_MAX_ENTRIES);
  return signToken(historyClaims.parse({ t: "history", e, iat, exp: iat + HISTORY_TTL_SECONDS }), secret, HISTORY_PURPOSE);
}

export async function verifyHistory(token: string | undefined, secret: string, opts: { now?: number } = {}): Promise<HistoryEntries> {
  if (!token) return [];
  const v = await verifyToken(token, secret, HISTORY_PURPOSE);
  if (!v.ok) return [];
  const p = historyClaims.safeParse(v.payload);
  if (!p.success) return [];
  const now = opts.now ?? nowSeconds();
  if (p.data.exp <= now) return [];
  return p.data.e;
}

export function addHistory(entries: HistoryEntries, studyId: string, participantId: string): HistoryEntries {
  return [...entries.filter(([s, p]) => !(s === studyId && p === participantId)), [studyId, participantId]];
}
