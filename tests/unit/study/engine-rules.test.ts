import { describe, expect, it } from "vitest";

import { resolveLearningAccess, resolveParticipantSession } from "../../../src/server/auth/learning-decision";
import { signParticipantSession, verifyParticipantSession } from "../../../src/server/auth/participant-session-token";
import type { StudySessionLookup, StudySessionRecord } from "../../../src/server/auth/study-session-port-types";
import {
  DEFAULT_STEPS,
  NEW_STUDY_CONFIG,
  PRACTICE_ROUTES_AVAILABLE,
  StudyConfigError,
  instrumentsFor,
  parseStudyProtocol,
  protocolIssues,
} from "../../../src/server/study/config";
import { delayedAvailability, evaluateDevice, generateParticipantCode, learningMayEnd, positionOf, resumeDecision, type DeviceReport } from "../../../src/server/study/engine";
import { INSTRUMENT_DEFINITIONS, displayedText, instrumentBlocker, neutralise } from "../../../src/server/study/instruments";
import { addHistory, signEnrolment, signHistory, verifyEnrolment, verifyHistory } from "../../../src/server/study/tokens";
import { studyConfigSchema } from "../../../src/features/study/contracts";
import { titleCase } from "../../../src/lib/text/title-case";

const SECRET = "x".repeat(48);
const P = "0190a3c2-1111-7000-8000-000000000001";
const S = "0190a3c2-2222-7000-8000-000000000002";

const issuesOf = (raw: Record<string, unknown>) => {
  const cfg = studyConfigSchema.parse({ familiarisation: { minutes: 5 }, ...raw });
  return protocolIssues(cfg, cfg.steps ?? DEFAULT_STEPS);
};

describe("study protocol config (Concept Note rev2, section 7)", () => {
  it("defaults to the note's order, with no concept map before learning", () => {
    expect(DEFAULT_STEPS).toEqual([
      "questionnaire_pre", "pre_test", "entrance", "familiarisation", "onboarding", "learning",
      "questionnaire_post_learning", "post_test", "transfer", "reconstruction", "layout_sketch", "questionnaire_end", "delayed_test",
    ]);
    expect(PRACTICE_ROUTES_AVAILABLE).toBe(true);
    const p = parseStudyProtocol({ familiarisation: { minutes: 5 } });
    expect(p.steps).toEqual(DEFAULT_STEPS);
    // The default order needs the practice minutes: refused loudly, never silently dropped.
    expect(() => parseStudyProtocol({})).toThrow(/familiarisation.minutes/);
    expect(p.config.allocation.point).toBe("after_pre_test");
    expect(p.config.resume).toEqual({ allowed: true });
  });

  it("gives new studies the adopted defaults: self-paced, a 30-minute cap, every stage, balanced by the pre-test", () => {
    const p = parseStudyProtocol(NEW_STUDY_CONFIG);
    expect(p.config.exposure).toEqual({ mode: "self_paced", minutes: 30, allowEarlyFinish: true, requireEveryStage: true });
    expect(p.config.delayedTest).toEqual({ opensAfterDays: 6, dueAfterDays: 7, closesAfterDays: 14 });
    expect(p.config.familiarisation).toEqual({ minutes: 5 });
    expect(p.steps.indexOf("familiarisation")).toBe(p.steps.indexOf("onboarding") - 1);
    expect(p.config.allocation).toMatchObject({ algorithm: "stratified_block", blockSize: 4, point: "after_pre_test", stratifyBy: { source: "pre_test_score" } });
  });

  it("rejects anything between learning and questionnaire_post_learning", () => {
    expect(issuesOf({ steps: ["onboarding", "learning", "post_test", "questionnaire_post_learning"] })).toContain(
      "steps: nothing may come between learning and questionnaire_post_learning",
    );
    expect(issuesOf({ steps: ["onboarding", "learning", "questionnaire_post_learning", "post_test"] })).toEqual([]);
  });

  it("keeps the pre-allocation steps condition-blind and first", () => {
    expect(issuesOf({ steps: ["onboarding", "learning", "pre_test"] })).toEqual(
      expect.arrayContaining(["steps: pre_test must come before learning"]),
    );
    expect(issuesOf({ steps: ["questionnaire_pre", "onboarding", "pre_test", "learning"] }).some((i) => i.includes("before every condition-specific step"))).toBe(true);
    // Allocation at enrolment: the old flexibility, and researcher strata allowed.
    expect(issuesOf({ steps: ["onboarding", "learning"], allocation: { point: "enrolment", algorithm: "stratified_block", strata: ["a", "b"] } })).toEqual([]);
    expect(issuesOf({ allocation: { strata: ["a"] } })).toContain("allocation.strata: researcher-entered strata are only used when allocation.point = enrolment");
  });

  it("validates stratification from the pre-test", () => {
    expect(issuesOf({ allocation: { algorithm: "stratified_block", stratifyBy: { source: "pre_test_score", cutoff: 3 } } })).toEqual([]);
    expect(issuesOf({ allocation: { algorithm: "block", stratifyBy: { source: "pre_test_score", cutoff: 3 } } })).toContain(
      "allocation.stratifyBy needs allocation.algorithm = stratified_block",
    );
    expect(issuesOf({ steps: ["onboarding", "learning"], allocation: { algorithm: "stratified_block", stratifyBy: { source: "pre_test_score", cutoff: 2 } } })).toContain(
      "allocation.stratifyBy pre_test_score needs the pre_test step",
    );
    expect(() => studyConfigSchema.parse({ allocation: { algorithm: "stratified_block", stratifyBy: { source: "pre_map_recall", cutoff: 0.2 } } })).toThrow();
    expect(() => studyConfigSchema.parse({ steps: ["pre_reconstruction"] })).toThrow();
    expect(issuesOf({ allocation: { algorithm: "stratified_block" } })).toContain("allocation.algorithm stratified_block after the pre-test needs allocation.stratifyBy");
  });

  it("keeps the delayed test last, SUS before it, and the common questions before the test", () => {
    const tail = ["onboarding", "learning", "questionnaire_post_learning", "post_test", "questionnaire_end"];
    expect(issuesOf({ steps: [...tail, "delayed_test"] })).toEqual([]);
    expect(issuesOf({ steps: [...tail] })).toEqual([]);
    expect(issuesOf({ steps: ["onboarding", "learning", "questionnaire_post_learning", "delayed_test", "questionnaire_end"] })).toContain("steps: delayed_test must be the last step");
    expect(issuesOf({ steps: ["entrance", "familiarisation", "onboarding", "learning"] })).toEqual([]);
    expect(issuesOf({ steps: ["familiarisation", "entrance", "onboarding", "learning"] })).toContain("steps: entrance must come before familiarisation");
    expect(() => studyConfigSchema.parse({ delayedTest: { opensAfterDays: 8, dueAfterDays: 7, closesAfterDays: 14 } })).toThrow();
  });

  it("accepts the familiarisation step with 5–10 practice minutes and refuses it without", () => {
    expect(issuesOf({ steps: ["familiarisation", "onboarding", "learning"], familiarisation: { minutes: 5 } })).toEqual([]);
    expect(() => studyConfigSchema.parse({ familiarisation: { minutes: 12 } })).toThrow();
    expect(() => parseStudyProtocol({ steps: ["familiarisation", "onboarding", "learning"] })).toThrow(StudyConfigError);
  });

  it("needs the researchers' hint text for hybrid guidance (D6)", () => {
    expect(issuesOf({ guidance: { policy: "hybrid", cueEnabled: true } })).toContain(
      "guidance: a hybrid policy with cueEnabled needs guidance.hintText (the hint both conditions show)",
    );
    expect(issuesOf({ guidance: { policy: "hybrid", cueEnabled: true, hintText: "Researcher text." } })).toEqual([]);
  });

  it("gives both doors the common questions, and presence and motion sickness to Door 2 only", () => {
    const p = parseStudyProtocol(NEW_STUDY_CONFIG);
    expect(instrumentsFor(p, "questionnaire_post_learning", "2d").map((r) => r.code)).toEqual(["common-questions"]);
    expect(instrumentsFor(p, "questionnaire_post_learning", "immersive").map((r) => r.code)).toEqual(["common-questions", "mps-physical-presence", "ssq"]);
    expect(instrumentsFor(p, "questionnaire_pre", null).map((r) => r.code)).toEqual(["background"]);
    expect(instrumentsFor(p, "questionnaire_end", "2d").map((r) => r.code)).toEqual(["sus"]);
  });
});

describe("journey rules", () => {
  const steps = DEFAULT_STEPS;
  const blind = ["questionnaire_pre", "pre_test"] as const;
  it("runs the blind steps, then the device check, then allocation, then the entrance and the rest", () => {
    expect(positionOf({ steps, blind, done: new Set(), allocated: false, devicePassed: false })).toMatchObject({ kind: "step", step: "questionnaire_pre" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: false, devicePassed: false })).toEqual({ kind: "device_check" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: false, devicePassed: true })).toEqual({ kind: "allocation" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: true, devicePassed: true })).toMatchObject({ step: "entrance" });
    expect(positionOf({ steps, blind, done: new Set([...blind, "entrance"]), allocated: true, devicePassed: true })).toMatchObject({ step: "familiarisation" });
    expect(positionOf({ steps, blind, done: new Set(steps), allocated: true, devicePassed: true })).toEqual({ kind: "finish" });
    // Allocation at enrolment: device check first.
    expect(positionOf({ steps, blind: [], done: new Set(), allocated: true, devicePassed: false })).toEqual({ kind: "device_check" });
  });

  it("applies one device rule to everyone, before any door is known", () => {
    const r: DeviceReport = { viewport: { width: 1280, height: 800 }, webglVersion: null, inputDevices: [] };
    expect(evaluateDevice(r, { policy: "exclude" })).toBe("webgl_exclude");
    expect(evaluateDevice(r, { policy: "reassign" })).toBe("webgl_retry");
    expect(evaluateDevice(r, { policy: "retry" })).toBe("webgl_retry");
    expect(evaluateDevice({ ...r, webglVersion: 2 }, { policy: "retry", minViewport: { width: 1400, height: 800 } })).toBe("viewport_too_small");
    expect(evaluateDevice({ ...r, webglVersion: 2 }, { policy: "retry" })).toBe("passed");
    expect(evaluateDevice({ ...r, webglVersion: 1 }, { policy: "exclude" })).toBe("webgl_exclude");
    expect(evaluateDevice({ ...r, webglVersion: 2, softwareRenderer: true }, { policy: "retry" })).toBe("webgl_retry");
  });

  it("ends learning only when the cap has passed, or when every required stage was visited", () => {
    const at = (exposure: Record<string, unknown>, endsAt: Date | null) => ({ learning: { startedAt: new Date(0), endsAt, endedAt: null }, now: new Date(1000), study: { protocol: { config: { exposure } } } }) as unknown as Parameters<typeof learningMayEnd>[0];
    const future = new Date(5000);
    const guarded = { allowEarlyFinish: true, requireEveryStage: true };
    expect(learningMayEnd(at(guarded, future), false)).toBe(false);
    expect(learningMayEnd(at(guarded, future), true)).toBe(true);
    expect(learningMayEnd(at(guarded, new Date(500)), false)).toBe(true);
    expect(learningMayEnd(at({ allowEarlyFinish: false, requireEveryStage: false }, future), true)).toBe(false);
    expect(learningMayEnd(at({ allowEarlyFinish: false, requireEveryStage: false }, null), true)).toBe(true);
  });

  it("opens the delayed test only inside its window", () => {
    const schedule = { opensAt: new Date(1000), closesAt: new Date(3000) };
    expect(delayedAvailability(schedule, new Date(999))).toBe("early");
    expect(delayedAvailability(schedule, new Date(2000))).toBe("open");
    expect(delayedAvailability(schedule, new Date(3001))).toBe("closed");
  });

  it("decides resumes from the configured limits", () => {
    expect(resumeDecision({ allowed: true }, { interruptionCount: 9, gapSeconds: 99999 })).toEqual({ ok: true });
    expect(resumeDecision({ allowed: false }, { interruptionCount: 0, gapSeconds: 0 })).toEqual({ ok: false, reason: "resume_not_allowed" });
    expect(resumeDecision({ allowed: true, maxInterruptions: 2 }, { interruptionCount: 2, gapSeconds: 0 })).toEqual({ ok: false, reason: "too_many_interruptions" });
    expect(resumeDecision({ allowed: true, maxGapMinutes: 10 }, { interruptionCount: 0, gapSeconds: 601 })).toEqual({ ok: false, reason: "gap_too_long" });
  });

  it("generates pseudonymous codes that satisfy the database pattern", () => {
    const codes = new Set(Array.from({ length: 200 }, generateParticipantCode));
    expect(codes.size).toBe(200);
    for (const c of codes) expect(c).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/);
  });
});

describe("instrument definitions (D7)", () => {
  it("seeds the verified wording with its source, and displayed variants next to the original", () => {
    const by = (code: string) => INSTRUMENT_DEFINITIONS.find((d) => d.code === code)!;
    const cl = by("cognitive-load");
    expect([cl.version, cl.items.length, cl.pending]).toEqual([2, 14, []]);
    expect(cl.items.filter((i) => i.source.startsWith("Leppink")).map((i) => i.key)).toEqual(["el-instr.4", "el-instr.5", "el-instr.6"]);
    expect(cl.items.some((i) => i.sourceCode === "ECL_I_4")).toBe(true);
    // Response format option (a): Leppink's 0-10 for all items, the only one with verified labels.
    expect(cl.responseScale).toMatchObject({ points: 11, min: 0, anchors: { "0": "not at all the case", "10": "completely the case" }, anchorsVerified: true });
    expect(neutralise("The interaction technique used in the simulation was very unclear.")).toBe("The interaction technique used in the learning environment was very unclear.");
    expect(neutralise("The virtual environment was full of irrelevant content.")).toBe("The learning environment was full of irrelevant content.");
    const sus = by("sus");
    expect(sus.items).toHaveLength(10);
    expect(displayedText(sus.items[7]!)).toBe("I found the system very awkward to use.");
    expect(sus.items[7]!.original).toBe("I found the system very cumbersome to use.");
    expect(sus.items.every((i) => i.secondary)).toBe(true);
    expect(sus.responseScale.anchors).toEqual({ "1": "Strongly Disagree", "5": "Strongly Agree" });
    const ssq = by("ssq");
    expect(ssq.items).toHaveLength(16);
    expect(ssq.responseScale).toMatchObject({ points: 4, min: 0, anchors: { "0": "not experienced", "3": "severe" } });
    expect(by("umux-lite").items.map((i) => i.original)).toEqual(["This system's capabilities meet my requirements.", "This system is easy to use."]);
    const mps = by("mps-physical-presence");
    expect([mps.conditions, mps.items.length, mps.responseScale.anchorsVerified]).toEqual([["immersive"], 5, false]);
    expect(ssq.conditions).toEqual(["immersive"]);
    expect(by("common-questions").items.map((i) => i.key)).toEqual(["common.mental_effort", "common.navigation_effort", "common.comfort", "common.engagement"]);
    expect(by("common-questions").responseScale.points).toBe(7);
    expect(by("background").items.every((i) => (i.choices?.length ?? 0) >= 2)).toBe(true);
    expect(INSTRUMENT_DEFINITIONS.every((d) => d.pending.length === 0)).toBe(true);
    expect(INSTRUMENT_DEFINITIONS.map((d) => d.name)).toEqual([titleCase("about you"), titleCase("questions about the learning task"), "Cognitive Load Scale", "Physical Presence Scale", "System Usability Scale", "Simulator Sickness Questionnaire", "UMUX-LITE"]);
  });

  it("refuses instruments with pending or unsourced wording", () => {
    expect(instrumentBlocker({ config: { instrument: { pendingItems: [{ key: "sus.1", reason: "x" }] } }, items: [] })).toMatch(/pending verification: sus\.1/);
    expect(instrumentBlocker({ config: { instrument: { pendingItems: [] } }, items: [{ itemKey: "a", config: { kind: "likert", points: 5 } }] })).toMatch(/without recorded source wording: a/);
    expect(instrumentBlocker({ config: { instrument: { pendingItems: [] } }, items: [{ itemKey: "a", config: { provenance: { original: "x" } } }] })).toBeNull();
    expect(instrumentBlocker({ config: {}, items: [] })).toBeNull();
  });
});

describe("participant cookie before and after allocation", () => {
  const record = (condition: StudySessionRecord["condition"]): StudySessionRecord => ({ sessionId: S, participantId: P, condition, status: "in_progress", participantStatus: "active", withdrawn: false });
  const lookup = (r: StudySessionRecord): StudySessionLookup => ({ findSession: async () => r });

  it("allows an unallocated session in the study pages but never in a learning condition", async () => {
    const token = await signParticipantSession({ participantId: P, sessionId: S, condition: null }, SECRET);
    expect((await verifyParticipantSession(token, SECRET)).ok).toBe(true);
    expect(await resolveParticipantSession(token, { secret: SECRET, lookup: lookup(record(null)) })).toMatchObject({ allowed: true, participant: { condition: null } });
    const learn = await resolveLearningAccess({ condition: "2d", participantCookie: token, demoCookie: undefined, staff: async () => null }, { secret: SECRET, lookup: lookup(record(null)) });
    expect(learn).toMatchObject({ allowed: false, redirectTo: "/study/session" });
  });

  it("sends a pre-allocation cookie of an allocated session to be re-issued", async () => {
    const token = await signParticipantSession({ participantId: P, sessionId: S, condition: null }, SECRET);
    expect(await resolveParticipantSession(token, { secret: SECRET, lookup: lookup(record("immersive")) })).toEqual({ allowed: false, redirectTo: "/study/allocate" });
    const learn = await resolveLearningAccess({ condition: "immersive", participantCookie: token, demoCookie: undefined, staff: async () => null }, { secret: SECRET, lookup: lookup(record("immersive")) });
    expect(learn).toMatchObject({ allowed: false, redirectTo: "/study/session" });
    // A cookie for one condition never passes for another.
    const twoD = await signParticipantSession({ participantId: P, sessionId: S, condition: "2d" }, SECRET);
    expect(await resolveParticipantSession(twoD, { secret: SECRET, lookup: lookup(record("immersive")) })).toMatchObject({ allowed: false, redirectTo: "/study/exit?reason=invalid-session" });
  });
});

describe("study tokens", () => {
  it("round-trips the enrolment token, which can never pass as a participant session", async () => {
    const token = await signEnrolment({ participantId: P, studyId: S }, SECRET);
    expect(await verifyEnrolment(token, SECRET)).toEqual({ participantId: P, studyId: S });
    expect(await verifyEnrolment(token, "y".repeat(48))).toBeNull();
    expect((await verifyParticipantSession(token, SECRET)).ok).toBe(false);
    const now = Math.floor(Date.now() / 1000);
    expect(await verifyEnrolment(token, SECRET, { now: now + 3 * 3600 })).toBeNull();
  });

  it("keeps a bounded, de-duplicated participation history", async () => {
    let h = addHistory([], S, P);
    h = addHistory(h, S, P);
    expect(h).toEqual([[S, P]]);
    const token = await signHistory(h, SECRET);
    expect(await verifyHistory(token, SECRET)).toEqual([[S, P]]);
    expect(await verifyHistory("garbage", SECRET)).toEqual([]);
  });
});
