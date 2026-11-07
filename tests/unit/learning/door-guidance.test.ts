import { describe, expect, it } from "vitest";

import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { studyConfigSchema } from "@/features/study/contracts";
import { doorGuidanceOf, resolveLearningContext, type LearningContextData } from "@/server/learning/context-data";

const capped: LearningTimeBudget = { mode: "self_paced", budgetSeconds: 2700, allowEarlyFinish: true, startedAt: "2026-11-07T10:00:00.000Z", endsAt: "2026-11-07T10:45:00.000Z", endedAt: null, serverNow: "2026-11-07T10:00:00.000Z", persisted: true };
const uncapped: LearningTimeBudget = { ...capped, startedAt: null, endsAt: null, persisted: false };

function data(config: unknown, includesUnverified: boolean): LearningContextData {
  return {
    async startLearningClock() {
      return { startedAt: capped.startedAt, budgetSeconds: capped.budgetSeconds, endsAt: capped.endsAt, endedAt: null, serverNow: capped.serverNow };
    },
    async findStudySession(sessionId) {
      return { sessionId, studyConfig: config, snapshotId: "s1", snapshotLabel: "v1", includesUnverified };
    },
    async findPreviewContent() {
      return { snapshotLabel: "review-1", studyConfig: config, includesUnverified };
    },
  };
}

const participant = { kind: "participant", experimental: true, condition: "2d", participantId: "p1", sessionId: "11111111-1111-4111-8111-111111111111" } as const;
const demo = { kind: "demo", experimental: false, condition: "immersive", demoId: "demo1234567890abcdef" } as const;

describe("door guidance from the study settings", () => {
  it("gives both doors the study's hint and stall seconds only when the cue is on", () => {
    const on = studyConfigSchema.parse({ guidance: { cueEnabled: true, stallSeconds: 90, hintText: "Follow the cloth." } });
    expect(doorGuidanceOf(on, capped)).toEqual({ time: { limitMinutes: 45, earlyFinish: true }, hint: "Follow the cloth.", stallSeconds: 90 });
    const off = studyConfigSchema.parse({ guidance: { cueEnabled: false, stallSeconds: 90, hintText: "Follow the cloth." } });
    expect(doorGuidanceOf(off, capped)).toMatchObject({ hint: null, stallSeconds: null });
  });

  it("reports no limit where no cap runs, even when the config names minutes", () => {
    expect(doorGuidanceOf(studyConfigSchema.parse({}), uncapped).time).toEqual({ limitMinutes: null, earlyFinish: true });
  });

  it("carries the guidance and the snapshot's review state into both kinds of learning context", async () => {
    const config = { guidance: { cueEnabled: true, hintText: "Follow the cloth." }, exposure: { mode: "self_paced", minutes: 45, allowEarlyFinish: false } };
    const study = await resolveLearningContext(participant, { data: data(config, true), appBuild: "test" });
    expect(study.guidance).toEqual({ time: { limitMinutes: 45, earlyFinish: false }, hint: "Follow the cloth.", stallSeconds: 120 });
    expect(study.contentUnderReview).toBe(true);
    const verified = await resolveLearningContext(participant, { data: data(config, false), appBuild: "test" });
    expect(verified.contentUnderReview).toBe(false);
    const visitor = await resolveLearningContext(demo, { data: data({}, true), appBuild: "test", now: () => capped.serverNow });
    expect(visitor.guidance).toEqual({ time: { limitMinutes: null, earlyFinish: true }, hint: null, stallSeconds: null });
    expect(visitor.contentUnderReview).toBe(true);
  });
});
