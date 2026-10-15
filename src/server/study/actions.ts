"use server";
/**
 * Server actions of the participant journey. Every action re-verifies the participant from the
 * signed cookie and the database (never from form fields), and each state change is done by the
 * engine (./engine.ts), which re-checks that the step is current. Redirects are issued outside
 * try/catch (redirect() throws).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { serverEnv } from "@/lib/env";
import { LEARNING_ROUTE } from "@/lib/permissions/learning";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession } from "@/server/auth/learning-decision";
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
  completeFamiliarisation,
  allocateSession,
  listStepAssessments,
  syncPosition,
  openSessionAfterConsent,
  startFamiliarisation,
  loadParticipant,
  loadSessionState,
  loadStudy,
  recordConsent,
  recordDeviceCheck,
  resumeSession,
  startAssessment,
  submitAssessment,
  withdraw,
  type DeviceOutcome,
} from "./engine";
import { clearEnrolment, readEnrolment, readHistory, setEnrolment, writeHistory } from "./session";
import { addHistory } from "./tokens";

export type FormState = { error?: string; fieldErrors?: Record<string, string> };

const appBuild = () => serverEnv().APP_BUILD_VERSION;

function messageFor(err: unknown): string {
  if (err instanceof StudyEngineError) {
    switch (err.code) {
      case "study_not_found":
        return "No study has this code. Check the code with the facilitator.";
      case "study_not_open":
        return "This study is not open for participation at the moment.";
      case "study_misconfigured":
      case "unsupported_design":
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
      case "learning_not_started":
        return "Open the learning task first.";
      case "familiarisation_not_finished":
        return "The practice time has not ended yet.";
      case "allocation_refused":
        return "This study cannot continue right now. Please tell the facilitator.";
      default:
        return "Something went wrong. Please tell the facilitator.";
    }
  }
  console.error("[study] action failed", err);
  return "Something went wrong. Please tell the facilitator.";
}

/** A live participant session in this browser, if any. */
async function liveParticipant() {
  const cookie = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  if (cookie === undefined) return null;
  const d = await resolveParticipantSession(cookie, { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup() });
  return d.allowed ? d.participant : null;
}

// ---- entry -----------------------------------------------------------------------------------

export async function enterStudy(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("studyCode") ?? "");
  const stratum = formData.get("stratum");
  if (!code.trim()) return { fieldErrors: { studyCode: "Enter the study code." } };
  const pool = getPool();
  let target = "/study/consent";
  try {
    // Already in a live session in this browser: never a second enrolment (the entry page
    // offers "continue" instead).
    if (await liveParticipant()) {
      target = "/study";
    } else {
      const study = await findEnrollableStudy(pool, code);
      const pending = await readEnrolment();
      const pendingParticipant = pending && pending.studyId === study.id ? await loadParticipant(pool, pending.participantId) : null;
      // An enrolment still waiting for its consent decision (or for its allocation after a
      // granted consent) is reused, not duplicated.
      const reusable = !!pendingParticipant && (!pendingParticipant.latestConsent || (pendingParticipant.latestConsent.decision === "granted" && !pendingParticipant.sessionId));
      if (!reusable) {
        const history = await readHistory();
        const previous = history.filter(([s]) => s === study.id).map(([, p]) => p);
        const r = await enrolParticipant(pool, study, { stratum: typeof stratum === "string" && stratum ? stratum : null, previousParticipantIds: previous });
        await setEnrolment({ participantId: r.participantId, studyId: study.id });
        await writeHistory(addHistory(history, study.id, r.participantId));
      }
    }
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect(target);
}

/** Continue an interrupted session from the entry page (records the interruption). */
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

// ---- consent ---------------------------------------------------------------------------------

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
    // A granted consent whose allocation failed (e.g. a transient error) is not recorded twice:
    // the retry goes straight to allocation.
    if (!(prior?.decision === "granted" && decision === "granted")) {
      await recordConsent(pool, { participantId: enrolment.participantId, study, decision, shownVersion: version });
    }
    if (decision === "declined") {
      target = "/study/complete?status=declined";
    } else {
      // Allocation at consent or, by default, after the condition-blind pre-test (D3).
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

// ---- device check ----------------------------------------------------------------------------

const deviceReportSchema = z.object({
  viewport: z.object({ width: z.number().int().positive().max(20000), height: z.number().int().positive().max(20000) }),
  devicePixelRatio: z.number().positive().max(8).optional(),
  webglVersion: z.union([z.literal(1), z.literal(2), z.null()]),
  inputDevices: z.array(z.enum(["mouse", "keyboard", "touch", "gamepad", "xr"])).max(5),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  /** The High contrast accommodation chosen in Display Settings before learning (DR-019). */
  contrastAccommodation: z.boolean().optional(),
  browserFamily: z.enum(["chrome", "edge", "firefox", "safari", "other"]).optional(),
});

export type DeviceCheckResult = { ok: true; outcome: DeviceOutcome["kind"]; reason?: string; minViewport?: { width: number; height: number } } | { ok: false; error: string };

export async function submitDeviceCheck(report: unknown): Promise<DeviceCheckResult> {
  const participant = await requireParticipantSession();
  const parsed = deviceReportSchema.safeParse(report);
  if (!parsed.success) return { ok: false, error: "The check could not be read. Please try again." };
  try {
    const outcome = await recordDeviceCheck(getPool(), participant.sessionId, parsed.data, { appBuild: appBuild() });
    if (outcome.kind === "reassigned") {
      await issueParticipantSessionCookie({ participantId: participant.participantId, sessionId: outcome.sessionId, condition: outcome.condition });
    }
    if (outcome.kind === "excluded") await clearParticipantSessionCookie();
    return { ok: true, outcome: outcome.kind, reason: outcome.kind === "retry" ? outcome.reason : undefined, minViewport: outcome.kind === "retry" ? outcome.minViewport : undefined };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

// ---- assessments -----------------------------------------------------------------------------

const stepSchema = z.enum(STUDY_STEPS);

/** Records that the assessment was presented (server time); called once the form is on screen. */
export async function markAssessmentStarted(step: string, assessmentId: string): Promise<{ ok: boolean }> {
  const participant = await requireParticipantSession();
  const st = stepSchema.safeParse(step);
  if (!st.success) return { ok: false };
  const pool = getPool();
  const s = await loadSessionState(pool, participant.sessionId);
  if (!s) return { ok: false };
  const a = (await listStepAssessments(pool, s, st.data)).find((x) => x.id === assessmentId);
  if (!a) return { ok: false };
  await startAssessment(pool, s, a, st.data);
  return { ok: true };
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
    if (r.stepCompleted && participant.condition === null) target = await allocateIfDue(participant);
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "invalid_answers") {
      return { error: messageFor(err), fieldErrors: (err.details.errors as Record<string, string>) ?? {} };
    }
    if (err instanceof StudyEngineError && (err.code === "not_current_step" || err.code === "already_submitted")) redirect("/study/session");
    return { error: messageFor(err) };
  }
  redirect(target);
}

/**
 * After the last condition-blind step: allocate (D3) and re-issue the cookie with the condition,
 * in this action (a Server Action may set cookies). /study/allocate does the same for blind steps
 * completed elsewhere (the reconstruction page).
 */
async function allocateIfDue(participant: { participantId: string; sessionId: string }): Promise<string> {
  const pool = getPool();
  const s = await loadSessionState(pool, participant.sessionId);
  if (!s || (await syncPosition(pool, s)).kind !== "allocation") return "/study/session";
  try {
    const a = await allocateSession(pool, participant.sessionId);
    await issueParticipantSessionCookie({ participantId: participant.participantId, sessionId: participant.sessionId, condition: a.condition });
    return "/study/session";
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "allocation_refused") return "/study/session?allocation=refused";
    throw err;
  }
}

// ---- onboarding and learning -----------------------------------------------------------------

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

// ---- familiarisation (for the /learn/<condition>/practice pages, D5) -------------------------

/** The practice page opened: returns the configured minutes and the server start time. */
export async function beginFamiliarisation(): Promise<{ ok: true; startedAt: string; minutes: number } | { ok: false; error: string }> {
  const participant = await requireParticipantSession();
  try {
    const r = await startFamiliarisation(getPool(), participant.sessionId);
    return { ok: true, startedAt: r.startedAt.toISOString(), minutes: r.minutes };
  } catch (err) {
    return { ok: false, error: messageFor(err) };
  }
}

/** Practice time over: complete the step and go on (refused before the configured minutes). */
export async function endFamiliarisation(_prev: FormState): Promise<FormState> {
  const participant = await requireParticipantSession();
  try {
    await completeFamiliarisation(getPool(), participant.sessionId);
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect("/study/session");
}

// ---- withdrawal and completion ---------------------------------------------------------------

export async function withdrawFromStudy(_prev: FormState, formData: FormData): Promise<FormState> {
  const reasonParsed = z.enum(WITHDRAWAL_REASONS).safeParse(formData.get("reason") ?? "not_stated");
  const reason = reasonParsed.success ? reasonParsed.data : "not_stated";
  if (formData.get("confirm") !== "yes") return { fieldErrors: { confirm: "Tick the box to confirm that you want to withdraw." } };
  const pool = getPool();
  try {
    const live = await liveParticipant();
    if (live) {
      await withdraw(pool, { participantId: live.participantId, sessionId: live.sessionId, reason });
      await clearParticipantSessionCookie();
    } else {
      const enrolment = await readEnrolment();
      if (!enrolment) return { error: "There is no study session to withdraw from in this browser. Please speak to the facilitator." };
      await withdraw(pool, { participantId: enrolment.participantId, sessionId: null, reason });
      await clearEnrolment();
    }
  } catch (err) {
    return { error: messageFor(err) };
  }
  redirect("/study/complete?status=withdrawn");
}

export async function finishSession(_prev: FormState): Promise<FormState> {
  const participant = await requireParticipantSession();
  try {
    await completeSession(getPool(), participant.sessionId);
    await clearParticipantSessionCookie();
  } catch (err) {
    if (err instanceof StudyEngineError && err.code === "not_current_step") redirect("/study/session");
    return { error: messageFor(err) };
  }
  redirect("/study/complete?status=completed");
}
