/** Questionnaire scale scores (dashboard) against hand-computed values. */
import { describe, expect, it } from "vitest";

import { numericAnswer, SCALES, scoreScale } from "../../../src/features/research/scale-scores";
import { INSTRUMENT_DEFINITIONS } from "../../../src/server/study/instruments";

const spec = (name: string) => SCALES.find((s) => s.name === name)!;
const answers = (keys: readonly string[], values: number[]) => new Map(keys.map((k, i) => [k, values[i]!]));

describe("scale scores", () => {
  it("SUS: odd items response − 1, even items 5 − response, sum × 2.5", () => {
    const sus = spec("sus.score");
    expect(scoreScale(sus, answers(sus.items, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]))).toBe(50);
    expect(scoreScale(sus, answers(sus.items, [5, 1, 5, 1, 5, 1, 5, 1, 5, 1]))).toBe(100);
    expect(scoreScale(sus, answers(sus.items, [1, 5, 1, 5, 1, 5, 1, 5, 1, 5]))).toBe(0);
    // odd: 4,3,2,1,0 = 10; even: 5-2,5-2,5-2,5-2,5-2 = 15; (10 + 15) × 2.5 = 62.5
    expect(scoreScale(sus, answers(sus.items, [5, 2, 4, 2, 3, 2, 2, 2, 1, 2]))).toBe(62.5);
  });

  it("cognitive-load subscale means and the SSQ Total Score (Kennedy et al. 1993, Table 4)", () => {
    expect(scoreScale(spec("cl.intrinsic"), answers(spec("cl.intrinsic").items, [2, 4, 9]))).toBe(5);
    expect(scoreScale(spec("cl.extraneous_interaction"), answers(spec("cl.extraneous_interaction").items, [1, 2, 3, 4]))).toBe(2.5);
    const ssq = spec("ssq.total");
    // Ratings 0,1,2,3,0,1,… by position. N column (1,6,7,8,9,15,16) = 11, O (1,2,3,4,5,9,11) = 8,
    // D (5,8,10,11,12,13,14) = 10; TS = (11 + 8 + 10) × 3.74 = 108.46.
    expect(scoreScale(ssq, answers(ssq.items, Array.from({ length: 16 }, (_, i) => i % 4)))).toBeCloseTo(108.46, 10);
    // Every symptom "severe" (3): each column 21, TS = 63 × 3.74 = 235.62, the declared maximum.
    expect(scoreScale(ssq, answers(ssq.items, Array(16).fill(3)))).toBeCloseTo(ssq.range[1], 10);
  });

  it("an incomplete administration is undefined, never prorated", () => {
    const il = spec("cl.intrinsic");
    expect(scoreScale(il, new Map([["il.1", 3], ["il.2", 4]]))).toBeNull();
    expect(scoreScale(il, new Map<string, number | null>([["il.1", 3], ["il.2", 4], ["il.3", null]]))).toBeNull();
  });

  it("reads the stored answer shape", () => {
    expect(numericAnswer({ value: 4, itemKind: "likert", assessmentVersion: 2 })).toBe(4);
    expect(numericAnswer(7)).toBe(7);
    expect(numericAnswer({ value: "a" })).toBeNull();
  });

  it("the scales of each instrument use exactly its seeded item keys", () => {
    for (const code of new Set(SCALES.map((s) => s.instrument))) {
      const def = INSTRUMENT_DEFINITIONS.filter((d) => d.code === code).at(-1)!;
      expect(def, code).toBeDefined();
      const used = SCALES.filter((s) => s.instrument === code).flatMap((s) => s.items);
      expect(def.items.map((i) => i.key).sort()).toEqual([...used].sort());
    }
  });
});
