import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import { doorGuidanceOf, resolveLearningContext, type LearningContextData } from "@/server/learning/context-data";

function data(config: unknown, verifiedStageConcepts: string[]): LearningContextData {
  return {
    async startLearningClock() {},
    async findStudySession(sessionId) {
      return { sessionId, studyConfig: config, snapshotId: "s1", snapshotLabel: "v1", verifiedStageConcepts };
    },
    async findPreviewContent() {
      return { snapshotId: "review-snapshot", snapshotLabel: "review-1", studyConfig: config, verifiedStageConcepts };
    },
  };
}

const participant = { kind: "participant", experimental: true, condition: "2d", participantId: "p1", sessionId: "11111111-1111-4111-8111-111111111111" } as const;
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

  it("carries the guidance and the snapshot's verified stages into both kinds of learning context", async () => {
    const config = { guidance: { cueEnabled: true, hintText: "Follow the cloth." }, exposure: { minutes: 45 } };
    const study = await resolveLearningContext(participant, { data: data(config, ["t.process_stage.a"]), appBuild: "test" });
    expect(study.guidance).toEqual({ time: { limitMinutes: 45 }, hint: "Follow the cloth.", stallSeconds: 120 });
    expect(study.verifiedStageConcepts).toEqual(["t.process_stage.a"]);
    const visitor = await resolveLearningContext(demo, { data: data({}, []), appBuild: "test" });
    expect(visitor.guidance).toEqual({ time: { limitMinutes: null }, hint: null, stallSeconds: null });
    expect(visitor.verifiedStageConcepts).toEqual([]);
  });

  it("names the snapshot both doors read their study photographs from, and the study's photo switch", async () => {
    const study = await resolveLearningContext(participant, { data: data({ figures: { photos: false } }, []), appBuild: "test" });
    expect(study).toMatchObject({ snapshotId: "s1", photosShown: false });
    const visitor = await resolveLearningContext(demo, { data: data({}, []), appBuild: "test" });
    expect(visitor).toMatchObject({ snapshotId: "review-snapshot", photosShown: true });
  });
});
