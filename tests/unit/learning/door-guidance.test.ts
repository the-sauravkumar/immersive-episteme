import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import type { StageTemplate } from "@/features/process/domain/stage-template";
import { doorGuidanceOf, LearningContextUnavailableError, resolveLearningContext, type LearningContextData } from "@/server/learning/context-data";

function data(config: unknown, verifiedStageConcepts: string[], clock: string[] = []): LearningContextData {
  return {
    async startLearningClock(sessionId) {
      clock.push(sessionId);
    },
    async findStudySession(sessionId) {
      return { sessionId, studyConfig: config, snapshotId: "s1", snapshotLabel: "v1", verifiedStageConcepts };
    },
    async findPreviewContent() {
      return { snapshotId: "review-snapshot", snapshotLabel: "review-1", studyConfig: config, verifiedStageConcepts };
    },
  };
}

const participant = { kind: "participant", experimental: true, condition: "2d", participantId: "p1", sessionId: "11111111-1111-4111-8111-111111111111" } as const;
const templates = [{ tradition: "ajrakh", traditionName: "Ajrakh", rawClothStateId: "raw", products: [], stages: [{ key: "a", sourceStageKeys: ["t.process_stage.a"] }] }] as unknown as StageTemplate[];
const demo = { kind: "demo", experimental: false, condition: "immersive", demoId: "demo1234567890abcdef" } as const;

describe("door guidance from the study settings", () => {
  it("gives both doors the study's hint and stall seconds only when the cue is on", () => {
    const on = studyConfigSchema.parse({ guidance: { cueEnabled: true, stallSeconds: 90, hintText: "Follow the cloth." }, exposure: { minutes: 45 } });
    expect(doorGuidanceOf(on)).toEqual({ time: { limitMinutes: 45 }, hint: "Follow the cloth.", stallSeconds: 90 });
    const off = studyConfigSchema.parse({ guidance: { cueEnabled: false, stallSeconds: 90, hintText: "Follow the cloth." } });
    expect(doorGuidanceOf(off)).toMatchObject({ hint: null, stallSeconds: null });
  });

  it("reports no limit when the study sets no cap", () => {
    expect(doorGuidanceOf(studyConfigSchema.parse({})).time).toEqual({ limitMinutes: null });
  });

  it("carries the guidance into both kinds of learning context when every stage is verified", async () => {
    const config = { guidance: { cueEnabled: true, hintText: "Follow the cloth." }, exposure: { minutes: 45 } };
    const study = await resolveLearningContext(participant, { data: data(config, ["t.process_stage.a"]), appBuild: "test", templates });
    expect(study.guidance).toEqual({ time: { limitMinutes: 45 }, hint: "Follow the cloth.", stallSeconds: 120 });
    const visitor = await resolveLearningContext(demo, { data: data({}, ["t.process_stage.a"]), appBuild: "test", templates });
    expect(visitor.guidance).toEqual({ time: { limitMinutes: null }, hint: null, stallSeconds: null });
  });

  it("serves no learner a stage the snapshot has not verified, and starts no clock", async () => {
    const clock: string[] = [];
    const refused = { name: "LearningContextUnavailableError", reason: "content_unverified" };
    await expect(resolveLearningContext(participant, { data: data({}, [], clock), appBuild: "test", templates })).rejects.toMatchObject(refused);
    await expect(resolveLearningContext(demo, { data: data({}, []), appBuild: "test", templates })).rejects.toBeInstanceOf(LearningContextUnavailableError);
    expect(clock).toEqual([]);
  });

  it("names the snapshot both doors read their study photographs from, and the study's photo switch", async () => {
    const study = await resolveLearningContext(participant, { data: data({ figures: { photos: false } }, []), appBuild: "test", templates: [] });
    expect(study).toMatchObject({ snapshotId: "s1", photosShown: false });
    const visitor = await resolveLearningContext(demo, { data: data({}, []), appBuild: "test", templates: [] });
    expect(visitor).toMatchObject({ snapshotId: "review-snapshot", photosShown: true });
  });
});
