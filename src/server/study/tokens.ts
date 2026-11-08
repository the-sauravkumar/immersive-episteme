import { z } from "zod";

import { signToken, verifyToken } from "@/server/auth/signed-token";

const ENROLMENT_PURPOSE = "study-enrolment/v1";
const HISTORY_PURPOSE = "study-history/v1";
export const ENROLMENT_TTL_SECONDS = 60 * 60 * 2;
export const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 180;
const HISTORY_MAX_ENTRIES = 20;

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
