/**
 * Request-bound helpers of the study engine (cookies, guards, redirects). Server-only.
 * Pages call these inside <Suspense> (cacheComponents: they read cookies and the database).
 */
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { serverEnv } from "@/lib/env";
import { LEARNING_ROUTE } from "@/lib/permissions/learning";
import { expiredCookie, hostOnly, SECURE_COOKIES } from "@/server/auth/cookie-names";
import { requireParticipantSession } from "@/server/auth/learning-access";
import { getPool } from "@/server/db/client";

import { practiceRoute, STEP_ROUTE, type StudyStep } from "./config";
import { loadSessionState, syncPosition, type Position, type SessionState } from "./engine";
import { ENROLMENT_TTL_SECONDS, HISTORY_TTL_SECONDS, signEnrolment, signHistory, verifyEnrolment, verifyHistory, type EnrolmentClaims, type HistoryEntries } from "./tokens";

/** Pre-allocation enrolment (between the study code and the consent decision). */
export const ENROLMENT_COOKIE = hostOnly("ie_study_enrolment");
/** Studies this browser enrolled in (repeat-enrolment detection only). */
export const HISTORY_COOKIE = hostOnly("ie_study_history");

const cookieBase = { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax" as const, path: "/" };

export async function readEnrolment(): Promise<EnrolmentClaims | null> {
  return verifyEnrolment((await cookies()).get(ENROLMENT_COOKIE)?.value, serverEnv().BETTER_AUTH_SECRET);
}

export async function setEnrolment(claims: EnrolmentClaims): Promise<void> {
  const token = await signEnrolment(claims, serverEnv().BETTER_AUTH_SECRET);
  (await cookies()).set(ENROLMENT_COOKIE, token, { ...cookieBase, maxAge: ENROLMENT_TTL_SECONDS });
}

export async function clearEnrolment(): Promise<void> {
  (await cookies()).set(expiredCookie(ENROLMENT_COOKIE));
}

export async function readHistory(): Promise<HistoryEntries> {
  return verifyHistory((await cookies()).get(HISTORY_COOKIE)?.value, serverEnv().BETTER_AUTH_SECRET);
}

export async function writeHistory(entries: HistoryEntries): Promise<void> {
  const token = await signHistory(entries, serverEnv().BETTER_AUTH_SECRET);
  (await cookies()).set(HISTORY_COOKIE, token, { ...cookieBase, maxAge: HISTORY_TTL_SECONDS });
}

export interface CurrentSession {
  state: SessionState;
  position: Position;
}

/**
 * The verified participant session (guard: signed cookie + live row) with its journal and the
 * current position, brought up to date. Redirects when there is no live session. Deduped per request.
 */
export const getCurrentSession = cache(async (arrivedAtHub: boolean = false): Promise<CurrentSession> => {
  const participant = await requireParticipantSession();
  const pool = getPool();
  const state = await loadSessionState(pool, participant.sessionId);
  if (!state) redirect("/study/exit?reason=invalid-session");
  const position = await syncPosition(pool, state, { arrivedAtHub });
  return { state, position };
});

/** Where the participant should be for a position. */
export function routeFor(position: Position, condition: SessionState["condition"]): string {
  switch (position.kind) {
    case "allocation":
      return "/study/allocate";
    case "device_check":
      return "/study/device-check";
    case "finish":
      return "/study/session";
    case "step":
      if (position.step === "learning") return condition ? LEARNING_ROUTE[condition] : "/study/session";
      if (position.step === "familiarisation") return condition ? practiceRoute(condition) : "/study/session";
      return STEP_ROUTE[position.step];
  }
}

/**
 * Page guard for a step page: renders only when `step` is the participant's current step,
 * otherwise redirects to the session hub (no skipping ahead, no going back to an earlier test).
 */
export async function requireStep(step: StudyStep | "device_check"): Promise<CurrentSession> {
  const current = await getCurrentSession();
  const p = current.position;
  const here = step === "device_check" ? p.kind === "device_check" : p.kind === "step" && p.step === step;
  if (!here) redirect("/study/session");
  return current;
}

/**
 * Guard for the reconstruction page (owned by the assessment module): renders only while a
 * reconstruction step is current and tells the page which phase it is. The step completes when
 * every concept-map item of the phase has a final map; the page then sends the participant to
 * /study/session.
 */
export async function requireReconstructionStep(): Promise<CurrentSession & { phase: "pre" | "post"; step: "pre_reconstruction" | "reconstruction" }> {
  const current = await getCurrentSession();
  const p = current.position;
  if (p.kind !== "step" || (p.step !== "pre_reconstruction" && p.step !== "reconstruction")) redirect("/study/session");
  return { ...current, step: p.step, phase: p.step === "pre_reconstruction" ? "pre" : "post" };
}
