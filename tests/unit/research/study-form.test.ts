import { describe, expect, it } from "vitest";

import { studyConfigSchema } from "@/features/study/contracts";
import { guidanceFromForm } from "@/server/research/study-form";

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
