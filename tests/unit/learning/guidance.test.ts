/**
 * The shared stall rule of the hybrid guidance (D6), used by both conditions.
 */
import { describe, expect, it } from "vitest";

import { createStallDetector, GUIDANCE_CUE_IDS } from "@/features/learning/guidance";
import { hybridGuidanceOn, learningSettingsOf } from "@/features/learning/settings";
import { studyConfigSchema } from "@/features/study/contracts";

/** Feeds one tick per second from `from` to `to` (exclusive) with the given state; returns the seconds at which the cue became due. */
function run(d: ReturnType<typeof createStallDetector>, from: number, to: number, state: { concept?: string | null; paused?: boolean } = {}) {
  const due: number[] = [];
  for (let s = from; s < to; s++) if (d.tick({ nowMs: s * 1000, exposedConceptId: state.concept ?? null, paused: state.paused ?? false })) due.push(s);
  return due;
}

describe("stall detector", () => {
  it("is due after stallSeconds of active time without a new concept, once per stall", () => {
    const d = createStallDetector(120);
    expect(run(d, 0, 300)).toEqual([120]);
    expect(d.activeMsSinceNew()).toBe(299_000);
  });

  it("restarts the count and re-arms on a newly exposed concept only", () => {
    const d = createStallDetector(60);
    expect(run(d, 0, 50)).toEqual([]);
    run(d, 50, 51, { concept: "a" }); // new concept: reset
    expect(run(d, 51, 100)).toEqual([]);
    expect(run(d, 100, 112)).toEqual([111]);
    // Re-opening a concept already seen neither resets nor re-arms.
    run(d, 112, 113, { concept: "a" });
    expect(run(d, 113, 300)).toEqual([]);
    // A new one does.
    run(d, 300, 301, { concept: "b" });
    expect(run(d, 301, 400)).toEqual([361]);
    expect(d.seenCount()).toBe(2);
  });

  it("does not count paused time or time spent reading", () => {
    const d = createStallDetector(30);
    run(d, 0, 1, { concept: "a" });
    expect(run(d, 1, 200, { paused: true })).toEqual([]);
    expect(run(d, 200, 400, { concept: "a" })).toEqual([]); // re-reading the same concept
    expect(d.activeMsSinceNew()).toBe(0);
    expect(run(d, 400, 432)).toEqual([430]);
  });

  it("uses one cue id per guidance kind for both conditions", () => {
    expect(GUIDANCE_CUE_IDS).toEqual({ hint: "guidance.hint", stall: "guidance.stall" });
  });
});

describe("guidance settings", () => {
  it("defaults to no hybrid guidance with a 120 s stall threshold (D6 pilot parameter)", () => {
    const s = learningSettingsOf(studyConfigSchema.parse({}));
    expect(s.guidance).toEqual({ policy: "none", cueEnabled: false, stallSeconds: 120, hintText: null });
    expect(hybridGuidanceOn(s.guidance)).toBe(false);
    expect(s.learningPrompts).toEqual([]);
  });

  it("is on only for policy hybrid with cueEnabled", () => {
    const on = learningSettingsOf(studyConfigSchema.parse({ guidance: { policy: "hybrid", cueEnabled: true, stallSeconds: 90, hintText: "Researcher text." } }));
    expect(on.guidance).toEqual({ policy: "hybrid", cueEnabled: true, stallSeconds: 90, hintText: "Researcher text." });
    expect(hybridGuidanceOn(on.guidance)).toBe(true);
    expect(hybridGuidanceOn({ policy: "hybrid", cueEnabled: false })).toBe(false);
    expect(hybridGuidanceOn({ policy: "guided", cueEnabled: true })).toBe(false);
  });

  it("validates learning prompts (unique ids, verbatim text)", () => {
    const cfg = studyConfigSchema.parse({ learningPrompts: [{ id: "p1", text: "  Researcher prompt.  " }] });
    expect(learningSettingsOf(cfg).learningPrompts).toEqual([{ id: "p1", text: "Researcher prompt." }]);
    expect(() => studyConfigSchema.parse({ learningPrompts: [{ id: "p1", text: "a" }, { id: "p1", text: "b" }] })).toThrow();
    expect(() => studyConfigSchema.parse({ guidance: { stallSeconds: 5 } })).toThrow();
  });
});
