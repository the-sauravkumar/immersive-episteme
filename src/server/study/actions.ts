"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { participantCodeSchema } from "@/features/study/contracts";
import { clientIpPolicy } from "@/lib/client-ip";
import { serverEnv } from "@/lib/env";
import { LEARNING_ROUTE } from "@/lib/permissions/learning";
import { inviteNotRevoked } from "@/server/access/invites";
import { admittingInviteId, grantSiteAccess, hasSiteAccess, requireSiteAccess } from "@/server/access/site-access";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession, resolveWithdrawalSession } from "@/server/auth/learning-decision";
import { requireParticipantSession } from "@/server/auth/learning-access";
import { clearParticipantSessionCookie, issueParticipantSessionCookie } from "@/server/auth/participant-session";
import { getStudySessionLookup } from "@/server/auth/study-session-port";
import { getPool } from "@/server/db/client";

import { STUDY_STEPS } from "./config";
import {
  StudyEngineError,
  WITHDRAWAL_REASONS,
  completeOnboarding,
  completeSession,
  enrolParticipant,
  findEnrollableStudy,
  findReturnableStudy,
  completeFamiliarisation,
  openSessionAfterConsent,
  loadParticipant,
  loadStudy,
  recordConsent,
  recordDeviceCheck,
  recordWalkthroughWebglFailure,
  resumeSession,
  returnToStudy,
  findReturningParticipant,
  markAssessmentPresented,
  submitAssessment,
  withdraw,
  type DeviceOutcome,
} from "./engine";
import { clientAddress, consumeEnrolmentAttempt } from "./enrolment-throttle";
import { clearEnrolment, readEnrolment, readHistory, setEnrolment, writeHistory } from "./session";
import { addHistory } from "./tokens";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

export type EntryFormState = FormState;

const appBuild = () => serverEnv().APP_BUILD_VERSION;

function messageFor(err: unknown): string {
  if (err instanceof StudyEngineError) {
    switch (err.code) {
      case "study_not_found":
        return "No study has this code. Check the code with the facilitator.";
      case "study_not_open":
        return "This study is not open for participation at the moment.";
      case "study_misconfigured":
      case "assessment_not_ready":
        return "This study cannot start right now. Please tell the facilitator.";
      case "repeat_browser":
        return "This browser has already been used to take part in this study. Please speak to the facilitator.";
      case "consent_already_recorded":
        return "Your decision has already been recorded.";
      case "already_submitted":
        return "These answers were already submitted.";
      case "invalid_answers":
        return "Some answers need attention.";
      case "learning_incomplete":
        return "Every stage must be visited before you finish.";
      case "delayed_test_not_open":
        return "The delayed test is not open yet.";
      case "learning_not_started":
        return "Open the learning task first.";
      case "familiarisation_not_finished":
        return "Open the practice first.";
      case "allocation_refused":
        return "This study cannot continue right now. Please tell the facilitator.";
      case "study_full":
        return "This study has all the participants it needs. Thank you for your interest.";
      case "earlier_code_unknown":
        return "No earlier study has this participant code. Check the code, or leave it empty to take part as a new participant.";
      case "nothing_new":
        return "You have already learned every craft this study offers, so there is nothing new left for you here. Thank you for taking part again.";
      case "enrolment_throttled":
        return "Many people are joining this study right now. Please wait a few minutes and try again, or ask the facilitator.";
      default:
        return "Something went wrong. Please tell the facilitator.";
    }
  }
  console.error("[study] action failed", err);
  return "Something went wrong. Please tell the facilitator.";
}

async function liveParticipant() {
  const cookie = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (cookie === undefined) return null;
  const d = await resolveParticipantSession(cookie, { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup() });
  return d.allowed ? d.participant : null;
}

async function withdrawableParticipant() {
  const cookie = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (cookie === undefined) return null;
  const d = await resolveWithdrawalSession(cookie, { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup() });
  return d.allowed ? d.participant : null;
}

export async function enterStudy(_prev: EntryFormState, formData: FormData): Promise<EntryFormState> {
  const code = String(formData.get("studyCode") ?? "");
  const earlierCode = String(formData.get("earlierCode") ?? "").trim();
  if (!code.trim()) return { fieldErrors: { studyCode: "Enter the study code." } };
  if (earlierCode && !participantCodeSchema.safeParse(earlierCode).success) return { fieldErrors: { earlierCode: "This is not a participant code. Check it, or leave the box empty." } };
  await requireSiteAccess("/study");
  const pool = getPool();
  let target = "/study/consent";
  try {
    if (await liveParticipant()) {
      target = "/study";
    } else {
      const study = await findEnrollableStudy(pool, code);
      const pending = await readEnrolment();
      const pendingParticipant = pending && pending.studyId === study.id ? await loadParticipant(pool, pending.participantId) : null;
      const reusable = !earlierCode && !!pendingParticipant && (!pendingParticipant.latestConsent || (pendingParticipant.latestConsent.decision === "granted" && !pendingParticipant.sessionId));
      if (!reusable) {
        if (!study.isDemo) {
          const policy = clientIpPolicy();
          const address = clientAddress(await headers(), { header: policy.header, trustedProxies: policy.trustedProxies });
          const gate = await consumeEnrolmentAttempt(pool, { studyId: study.id, address, limits: study.protocol.config.enrolment });
          if (!gate.allowed) throw new StudyEngineError("enrolment_throttled", "Too many enrolments right now.", { scope: gate.scope, retryAfterSeconds: gate.retryAfterSeconds });
        }
        const history = await readHistory();
        const previous = history.filter(([s]) => s === study.id).map(([, p]) => p);
        const r = await enrolParticipant(pool, study, { previousParticipantIds: previous, earlierParticipantCode: earlierCode || null, admittedByInviteId: await admittingInviteId() });
        await setEnrolment({ participantId: r.participantId, studyId: study.id });
        await writeHistory(addHistory(history, study.id, r.participantId));
      }
    }
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect(target);
}

export async function resumeStudy(_prev: FormState): Promise<FormState> {
  const live = await liveParticipant();
  if (!live) redirect("/study");
  let target = "/study/session";
  try {
    const r = await resumeSession(getPool(), live.sessionId);
    if (r.kind === "refused") {
      await clearParticipantSessionCookie();
      target = `/study/complete?status=ended&reason=${r.reason}`;
    }
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect(target);
}

export async function decideConsent(_prev: FormState, formData: FormData): Promise<FormState> {
  const decision = formData.get("decision");
  const version = String(formData.get("consentVersion") ?? "");
  if (decision !== "granted" && decision !== "declined") return { error: "Choose whether to take part." };
  if (decision === "granted" && formData.get("confirm") !== "yes") {
    return { fieldErrors: { confirm: "Tick the box to confirm that you have read the information and agree to take part." } };
  }
  const enrolment = await readEnrolment();
  if (!enrolment) redirect("/study?reason=enrolment-expired");
  const pool = getPool();
  let target: string;
  try {
    const study = await loadStudy(pool, enrolment.studyId);
    const prior = (await loadParticipant(pool, enrolment.participantId))?.latestConsent;
    if (!(prior?.decision === "granted" && decision === "granted")) {
      await recordConsent(pool, { participantId: enrolment.participantId, study, decision, shownVersion: version });
    }
    if (decision === "declined") {
      target = "/study/complete?status=declined";
    } else {
      const s = await openSessionAfterConsent(pool, { participantId: enrolment.participantId, studyId: study.id, appBuild: appBuild() });
      await issueParticipantSessionCookie({ participantId: s.participantId, sessionId: s.sessionId, condition: s.condition });
      target = "/study/session";
    }
    await clearEnrolment();
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect(target);
}

const deviceReportSchema = z.object({
  viewport: z.object({ width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000) }),
  devicePixelRatio: z.number().positive().max(8).optional(),
  webglVersion: z.union([z.literal(1), z.literal(2), z.null()]),
  softwareRenderer: z.boolean().optional(),
  inputDevices: z.array(z.enum(["mouse", "keyboard", "touch", "gamepad", "xr"])).max(5),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  browserFamily: z.enum(["chrome", "edge", "firefox", "safari", "other"]).optional(),
});

export type DeviceCheckResult = { ok: true; outcome: DeviceOutcome["kind"]; reason?: string; minViewport?: { width: number; height: number } } | { ok: false; error: string };

export async function submitDeviceCheck(report: unknown): Promise<DeviceCheckResult> {
  const participant = await requireParticipantSession();
  const parsed = deviceReportSchema.safeParse(report);
  if (!parsed.success) return { ok: false, error: "The check could not be read. Please try again." };
  try {
    const outcome = await recordDeviceCheck(getPool(), participant.sessionId, parsed.data);
    return { ok: true, outcome: outcome.kind, reason: outcome.kind === "retry" ? outcome.reason : undefined, minViewport: outcome.kind === "retry" ? outcome.minViewport : undefined };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

export async function reportWalkthroughUnavailable(report: unknown): Promise<DeviceCheckResult> {
  const participant = await requireParticipantSession();
  const parsed = z.object({ webglVersion: z.union([z.literal(1), z.literal(2), z.null()]), softwareRenderer: z.boolean() }).safeParse(report);
  if (!parsed.success) return { ok: false, error: "The check could not be read. Please try again." };
  try {
    const outcome = await recordWalkthroughWebglFailure(getPool(), participant.sessionId, parsed.data, { appBuild: appBuild() });
    if (outcome.kind === "ignored") return { ok: true, outcome: "passed" };
    if (outcome.kind === "reassigned") {
      await issueParticipantSessionCookie({ participantId: participant.participantId, sessionId: outcome.sessionId, condition: outcome.condition });
    }
    return { ok: true, outcome: outcome.kind, reason: outcome.kind === "retry" ? outcome.reason : undefined };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

const stepSchema = z.enum(STUDY_STEPS);

export async function markAssessmentStarted(step: string, assessmentId: string): Promise<{ ok: boolean }> {
  const participant = await requireParticipantSession();
  const st = stepSchema.safeParse(step);
  if (!st.success) return { ok: false };
  try {
    await markAssessmentPresented(getPool(), { sessionId: participant.sessionId, step: st.data, assessmentId });
    return { ok: true };
  } catch (err) {
    if (err instanceof StudyEngineError) return { ok: false };
    throw err;
  }
}

export async function submitAssessmentForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const participant = await requireParticipantSession();
  const step = stepSchema.safeParse(formData.get("step"));
  const assessmentId = String(formData.get("assessmentId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/study/session");
  if (!step.success || !/^[0-9a-f-]{36}$/i.test(assessmentId)) return { error: "The form could not be read." };
  const values: Record<string, string[]> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("item:") || typeof value !== "string") continue;
    const id = key.slice(5);
    (values[id] ??= []).push(value);
  }
  let target: string;
  try {
    const r = await submitAssessment(getPool(), {
      sessionId: participant.sessionId,
      step: step.data,
      assessmentId,
      values,
      clientTs: typeof formData.get("clientTs") === "string" ? String(formData.get("clientTs")) : null,
    });
    target = r.stepCompleted ? "/study/session" : returnTo.startsWith("/study/") ? returnTo : "/study/session";
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "invalid_answers") {
      return { error: messageFor(err), fieldErrors: (err.details.errors as Record<string, string>) ?? {} };
    }
    if (err instanceof StudyEngineError && (err.code === "not_current_step" || err.code === "already_submitted")) redirect("/study/session");
    return { error: messageFor(err) };
  }
  redirect(target);
}

export async function startLearning(_prev: FormState): Promise<FormState> {
  const participant = await requireParticipantSession();
  try {
    await completeOnboarding(getPool(), participant.sessionId);
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "not_current_step") redirect("/study/session");
    return { error: messageFor(err) };
  }
  redirect(participant.condition ? LEARNING_ROUTE[participant.condition] : "/study/session");
}

export async function endFamiliarisation(_prev: FormState): Promise<FormState> {
  const participant = await requireParticipantSession();
  try {
    await completeFamiliarisation(getPool(), participant.sessionId);
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect("/study/session");
}

const RETURN_REFUSED: Record<string, string> = {
  participant_not_found: "No participant in this study has this code. Check both codes, or ask the facilitator.",
  session_not_started: "You have not started the study yet. Open the study link the facilitator gave you and enter the study code.",
  session_closed: "Your session has already ended, so there is nothing to come back to. Thank you for taking part. Ask the facilitator if you think this is wrong.",
  resume_not_allowed: "This study does not allow a break, so your session has ended. Thank you for taking part. Please tell the facilitator.",
  too_many_interruptions: "Your session was paused more times than this study allows, so it has ended. Thank you for taking part. Please tell the facilitator.",
  gap_too_long: "Your break was longer than this study allows, so your session has ended. Thank you for taking part. Please tell the facilitator.",
};

const INVITE_WITHDRAWN = "The invite you joined with no longer lets anyone in. Ask the facilitator for a new invite link, open it, then use your return link again.";

export async function returnWithCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const studyCode = String(formData.get("studyCode") ?? "");
  const participantCode = String(formData.get("participantCode") ?? "").trim();
  if (!studyCode.trim() || !participantCode) return { error: "Enter the study code and your participant code." };
  if (!participantCodeSchema.safeParse(participantCode).success) return { error: RETURN_REFUSED.participant_not_found };
  const pool = getPool();
  const admitted = await hasSiteAccess();
  try {
    const study = await findReturnableStudy(pool, studyCode);
    if (!study.isDemo || !admitted) {
      const policy = clientIpPolicy();
      const address = clientAddress(await headers(), { header: policy.header, trustedProxies: policy.trustedProxies });
      const gate = await consumeEnrolmentAttempt(pool, { studyId: study.id, address, limits: study.protocol.config.enrolment, purpose: "return" });
      if (!gate.allowed) return { error: "Too many return attempts from this network right now. Please wait a few minutes and try again, or ask the facilitator." };
    }
    const who = await findReturningParticipant(pool, { studyCode, participantCode });
    if (!who) return { error: RETURN_REFUSED.participant_not_found };
    const readmitWith = admitted ? null : who.admittedByInviteId;
    if (!admitted && (readmitWith === null || !(await inviteNotRevoked(pool, readmitWith)))) return { error: INVITE_WITHDRAWN };
    const back = await returnToStudy(pool, { studyCode, participantCode });
    if (back.kind === "refused") return { error: RETURN_REFUSED[back.reason] };
    if (readmitWith) await grantSiteAccess(readmitWith);
    await issueParticipantSessionCookie({ participantId: back.participantId, sessionId: back.sessionId, condition: back.condition });
  } catch (err) {
    return { error: err instanceof StudyEngineError && RETURN_REFUSED[err.code] ? RETURN_REFUSED[err.code] : messageFor(err) };
  }
  redirect("/study/session");
}

export async function withdrawFromStudy(_prev: FormState, formData: FormData): Promise<FormState> {
  const reasonParsed = z.enum(WITHDRAWAL_REASONS).safeParse(formData.get("reason") ?? "not_stated");
  const reason = reasonParsed.success ? reasonParsed.data : "not_stated";
  if (formData.get("confirm") !== "yes") return { fieldErrors: { confirm: "Tick the box to confirm that you want to withdraw." } };
  try {
    const live = await withdrawableParticipant();
    if (!live) return { error: "There is no study session to withdraw from in this browser. Please speak to the facilitator." };
    await withdraw(getPool(), { participantId: live.participantId, sessionId: live.sessionId, reason });
    await clearParticipantSessionCookie();
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect("/study/complete?status=withdrawn");
}

export async function finishSession(_prev: FormState, telemetryPending?: unknown): Promise<FormState> {
  const participant = await requireParticipantSession();
  const undelivered = z.number().int().min(0).max(1_000_000).safeParse(telemetryPending);
  try {
    await completeSession(getPool(), participant.sessionId, { telemetryPending: undelivered.success ? undelivered.data : null });
    await clearParticipantSessionCookie();
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "not_current_step") redirect("/study/session");
    return { error: messageFor(err) };
  }
  redirect("/study/complete?status=completed");
}
