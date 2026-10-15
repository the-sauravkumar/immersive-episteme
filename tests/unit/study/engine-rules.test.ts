import { describe, expect, it } from "vitest";

import { resolveLearningAccess, resolveParticipantSession } from "../../../src/server/auth/learning-decision";
import { signParticipantSession, verifyParticipantSession } from "../../../src/server/auth/participant-session-token";
import type { StudySessionLookup, StudySessionRecord } from "../../../src/server/auth/study-session-port-types";
import {
  D8_STEPS,
  DEFAULT_STEPS,
  NEW_STUDY_CONFIG,
  PRACTICE_ROUTES_AVAILABLE,
  StudyConfigError,
  instrumentsFor,
  parseStudyProtocol,
  protocolIssues,
} from "../../../src/server/study/config";
import { evaluateDevice, generateParticipantCode, positionOf, resumeDecision, type DeviceReport } from "../../../src/server/study/engine";
import { INSTRUMENT_DEFINITIONS, displayedText, instrumentBlocker, neutralise } from "../../../src/server/study/instruments";
import { addHistory, signEnrolment, signHistory, verifyEnrolment, verifyHistory } from "../../../src/server/study/tokens";
import { studyConfigSchema } from "../../../src/features/study/contracts";

const SECRET = "x".repeat(48);
const P = "0190a3c2-1111-7000-8000-000000000001";
const S = "0190a3c2-2222-7000-8000-000000000002";

/** Familiarisation minutes are set unless a test overrides them (the D8 default order includes the step). */
const issuesOf = (raw: Record<string, unknown>) => {
  const cfg = studyConfigSchema.parse({ familiarisation: { minutes: 5 }, ...raw });
  return protocolIssues(cfg, cfg.steps ?? DEFAULT_STEPS);
};

describe("study protocol config (D3, D5, D8)", () => {
  it("defaults to the D8 order, familiarisation included now that its practice routes exist", () => {
    expect(D8_STEPS).toEqual([
      "questionnaire_pre", "pre_test", "pre_reconstruction", "familiarisation", "onboarding", "learning",
      "questionnaire_post_learning", "post_test", "transfer", "reconstruction", "questionnaire_end",
    ]);
    expect(PRACTICE_ROUTES_AVAILABLE).toBe(true);
    expect(DEFAULT_STEPS).toEqual(D8_STEPS);
    const p = parseStudyProtocol({ familiarisation: { minutes: 5 } });
    expect(p.steps).toEqual(DEFAULT_STEPS);
    // The default order needs the practice minutes: refused loudly, never silently dropped.
    expect(() => parseStudyProtocol({})).toThrow(/familiarisation.minutes/);
    expect(p.config.allocation.point).toBe("after_pre_test");
    expect(p.config.resume).toEqual({ allowed: true });
  });

  it("gives new studies the adopted defaults: 30 fixed minutes, no early finish, allocation after the pre-test", () => {
    const p = parseStudyProtocol(NEW_STUDY_CONFIG);
    expect(p.config.exposure).toEqual({ mode: "fixed_time", minutes: 30, allowEarlyFinish: false });
    expect(p.config.familiarisation).toEqual({ minutes: 5 });
    expect(p.steps.indexOf("familiarisation")).toBe(p.steps.indexOf("onboarding") - 1);
    expect(p.config.allocation).toMatchObject({ algorithm: "block", blockSize: 4, point: "after_pre_test" });
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
    expect(issuesOf({ steps: ["pre_test", "onboarding", "learning"], allocation: { algorithm: "stratified_block", stratifyBy: { source: "pre_map_recall", cutoff: 0.2 } } })).toContain(
      "allocation.stratifyBy pre_map_recall needs the pre_reconstruction step",
    );
    expect(issuesOf({ allocation: { algorithm: "stratified_block" } })).toContain("allocation.algorithm stratified_block after the pre-test needs allocation.stratifyBy");
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

  it("filters questionnaire instruments by condition (presence for the 3D group only)", () => {
    const p = parseStudyProtocol(NEW_STUDY_CONFIG);
    expect(instrumentsFor(p, "questionnaire_post_learning", "2d").map((r) => r.code)).toEqual(["cognitive-load", "ssq"]);
    expect(instrumentsFor(p, "questionnaire_post_learning", "immersive").map((r) => r.code)).toEqual(["cognitive-load", "ssq", "mps-physical-presence"]);
    expect(instrumentsFor(p, "questionnaire_post_learning", null).map((r) => r.code)).toEqual(["cognitive-load", "ssq"]);
    expect(instrumentsFor(p, "questionnaire_pre", null).map((r) => r.code)).toEqual(["ssq"]);
    expect(instrumentsFor(p, "questionnaire_end", "2d").map((r) => r.code)).toEqual(["sus"]);
  });
});

describe("journey rules", () => {
  const steps = DEFAULT_STEPS;
  const blind = ["questionnaire_pre", "pre_test", "pre_reconstruction"] as const;
  it("runs the blind steps, then allocation, then the device check, then the rest", () => {
    expect(positionOf({ steps, blind, done: new Set(), allocated: false, devicePassed: false })).toMatchObject({ kind: "step", step: "questionnaire_pre" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: false, devicePassed: false })).toEqual({ kind: "allocation" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: true, devicePassed: false })).toEqual({ kind: "device_check" });
    expect(positionOf({ steps, blind, done: new Set(blind), allocated: true, devicePassed: true })).toMatchObject({ step: "familiarisation" });
    expect(positionOf({ steps, blind, done: new Set([...blind, "familiarisation"]), allocated: true, devicePassed: true })).toMatchObject({ step: "onboarding" });
    expect(positionOf({ steps, blind, done: new Set(steps), allocated: true, devicePassed: true })).toEqual({ kind: "finish" });
    // Allocation at enrolment: device check first.
    expect(positionOf({ steps, blind: [], done: new Set(), allocated: true, devicePassed: false })).toEqual({ kind: "device_check" });
  });

  it("applies the WebGL policy only to the immersive condition", () => {
    const r: DeviceReport = { viewport: { width: 1280, height: 800 }, webglVersion: null, inputDevices: [] };
    expect(evaluateDevice(r, { condition: "2d", policy: "exclude" })).toBe("passed");
    expect(evaluateDevice(r, { condition: "immersive", policy: "exclude" })).toBe("webgl_exclude");
    expect(evaluateDevice(r, { condition: "immersive", policy: "reassign" })).toBe("webgl_reassign");
    expect(evaluateDevice(r, { condition: "immersive", policy: "retry" })).toBe("webgl_retry");
    expect(evaluateDevice({ ...r, webglVersion: 2 }, { condition: "2d", policy: "retry", minViewport: { width: 1400, height: 800 } })).toBe("viewport_too_small");
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
    expect(INSTRUMENT_DEFINITIONS.every((d) => d.pending.length === 0)).toBe(true);
    expect(INSTRUMENT_DEFINITIONS.map((d) => d.name)).toEqual(["Cognitive Load Scale", "Physical Presence Scale", "System Usability Scale", "Simulator Sickness Questionnaire", "UMUX-LITE"]);
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
