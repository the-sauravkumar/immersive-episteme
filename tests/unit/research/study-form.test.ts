/**
 * Final review study-05: saving the study form must not drop the D6 guidance fields it does not
 * edit. Before the fix the action rebuilt guidance as {policy, cueEnabled}, so hintText vanished
 * (and the engine then refused every enrolment) and a tuned stallSeconds fell back to 120.
 */
import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import { guidanceFromForm } from "@/server/research/study-form";

const stored = { policy: "hybrid" as const, cueEnabled: true, stallSeconds: 90, hintText: "Look for the dyeing sequence." };

function form(fields: Record<string, string>): FormData {
  const d = new FormData();
  for (const [k, v] of Object.entries(fields)) d.set(k, v);
  return d;
}

describe("guidanceFromForm (study-05)", () => {
  it("keeps hintText and stallSeconds when the form only carries policy and the cue switch", () => {
    const g = guidanceFromForm(stored, form({ guidancePolicy: "hybrid", cueEnabled: "on" }));
    const parsed = studyConfigSchema.parse({ guidance: g }).guidance;
    expect(parsed).toEqual(stored);
  });

  it("takes the edited hint text and stall threshold from the form", () => {
    const g = guidanceFromForm(stored, form({ guidancePolicy: "hybrid", cueEnabled: "on", hintText: "  New hint. ", stallSeconds: "150" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).toEqual({ policy: "hybrid", cueEnabled: true, stallSeconds: 150, hintText: "New hint." });
  });

  it("an emptied hint box removes the hint; an empty stall box keeps the stored value", () => {
    const g = guidanceFromForm(stored, form({ guidancePolicy: "none", hintText: "", stallSeconds: "" }));
    expect(studyConfigSchema.parse({ guidance: g }).guidance).toEqual({ policy: "none", cueEnabled: false, stallSeconds: 90 });
  });
});
