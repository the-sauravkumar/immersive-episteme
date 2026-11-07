import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import { allocationFromForm, CONSOLE_ALLOCATION_ALGORITHMS, guidanceFromForm } from "@/server/research/study-form";
import { NEW_STUDY_CONFIG, protocolIssues } from "@/server/study/config";

const stored = { cueEnabled: true, stallSeconds: 90, hintText: "Look for the dyeing sequence." };

function form(fields: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

describe("guidanceFromForm (study-05)", () => {
  it("keeps hintText and stallSeconds when the form only carries the cue switch", () => {
    const g = guidanceFromForm(stored, form({ cueEnabled: "on" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).toEqual(stored);
  });

  it("takes the edited hint text and stall threshold from the form", () => {
    const g = guidanceFromForm(stored, form({ cueEnabled: "on", hintText: "  New hint. ", stallSeconds: "150" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).toEqual({ cueEnabled: true, stallSeconds: 150, hintText: "New hint." });
  });

  it("an emptied hint box removes the hint; an empty stall box keeps the stored value", () => {
    const g = guidanceFromForm(stored, form({ hintText: "", stallSeconds: "" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).toEqual({ cueEnabled: false, stallSeconds: 90 });
  });

  it("no longer writes a guidance policy the doors never read", () => {
    const g = guidanceFromForm({ ...stored, policy: "hybrid" } as never, form({ guidancePolicy: "guided", cueEnabled: "on" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).not.toHaveProperty("policy");
  });
});

describe("allocationFromForm: every algorithm the console offers can be activated and drawn", () => {
  const created = studyConfigSchema.parse(NEW_STUDY_CONFIG);

  it("offers only the algorithms the study engine draws", () => {
    expect([...CONSOLE_ALLOCATION_ALGORITHMS].sort()).toEqual(["block", "simple", "stratified_block"]);
  });

  it("passes the protocol rules for each offered algorithm, starting from a new study's defaults", () => {
    for (const algorithm of CONSOLE_ALLOCATION_ALGORITHMS) {
      const config = studyConfigSchema.parse({ ...NEW_STUDY_CONFIG, allocation: allocationFromForm(created.allocation, algorithm, 4) });
      expect(protocolIssues(config, config.steps ?? [])).toEqual([]);
      expect(config.allocation.algorithm).toBe(algorithm);
      expect(config.allocation.stratifyBy !== undefined).toBe(algorithm === "stratified_block");
    }
  });

  it("brings the pre-test stratification back when stratified blocks are chosen again, and keeps the seed", () => {
    const simple = studyConfigSchema.parse({ allocation: allocationFromForm({ ...created.allocation, seed: "s1" }, "simple", undefined) }).allocation;
    const back = studyConfigSchema.parse({ allocation: allocationFromForm(simple, "stratified_block", 4) }).allocation;
    expect(back).toMatchObject({ algorithm: "stratified_block", blockSize: 4, seed: "s1", stratifyBy: { source: "pre_test_score" } });
  });

  it("ignores an algorithm the form does not offer", () => {
    expect(allocationFromForm(created.allocation, "counterbalanced", 4).algorithm).toBe("stratified_block");
  });
});
