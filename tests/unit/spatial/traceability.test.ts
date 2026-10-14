import { describe, expect, it } from "vitest";

import { compileSpatialManifest } from "@/features/spatial/compiler";

import { compileContent, contentInput, syntheticInput } from "./fixtures";

describe("traceability: relationship -> rule -> element -> interaction -> construct", () => {
  const { manifest } = compileContent();
  const byId = new Map(manifest.elements.map((e) => [e.id, e]));
  const ruleIds = new Set((contentInput().ruleSet.config as { rules: { id: string }[] }).rules.map((r) => r.id));

  it("every element names a rule from the rule set, a rationale and at least one interaction", () => {
    for (const e of manifest.elements) {
      expect(ruleIds.has(e.ruleId), `${e.id} rule ${e.ruleId}`).toBe(true);
      expect(e.rationale.length, e.id).toBeGreaterThan(20);
      expect(e.trace.ruleIds).toContain(e.ruleId);
      expect(e.trace.interactions.length, e.id).toBeGreaterThan(0);
      for (const r of e.trace.ruleIds) expect(ruleIds.has(r)).toBe(true);
    }
  });

  it("every exhibit traces back to its concept, and every encoding to its relationship", () => {
    for (const e of manifest.elements) {
      if (e.kind === "exhibit" || e.kind === "station") expect(e.trace.conceptIds).toContain(e.conceptId);
      for (const enc of e.encodes) expect(e.trace.relationshipIds).toContain(enc.relationshipId);
    }
  });

  it("the relationship index and element encodings agree in both directions", () => {
    const fromIndex = new Set<string>();
    for (const r of manifest.traceability.relationships) {
      for (const enc of r.encodings) {
        expect(enc.interaction.event).toBeTruthy();
        for (const id of enc.elementIds) {
          const el = byId.get(id)!;
          expect(el.encodes.some((x) => x.relationshipId === r.relationshipId && x.ruleId === enc.ruleId && x.encoding === enc.encoding)).toBe(true);
          fromIndex.add(`${id}|${r.relationshipId}|${enc.ruleId}|${enc.encoding}`);
        }
      }
    }
    for (const e of manifest.elements) for (const enc of e.encodes) expect(fromIndex.has(`${e.id}|${enc.relationshipId}|${enc.ruleId}|${enc.encoding}`)).toBe(true);
  });

  it("explains in words why an exhibit stands where it does", () => {
    const saaj = byId.get("station:ajrakh.process_stage.saaj")!;
    expect(saaj.rationale).toMatch(/classification\.zone/);
    expect(saaj.rationale).toMatch(/stop 1 of 14/);
    expect(saaj.rationale).toMatch(/sequence\.path/);
  });

  it("carries assessment construct ids through to elements and the index when configured", () => {
    const r = compileSpatialManifest(syntheticInput(undefined, { assessmentConstructs: { "sequence.path": ["construct.process-order"], "causality.explanatory-progression": ["construct.causal"] } }));
    const path = r.manifest.elements.find((e) => e.id.startsWith("path:seq:"))!;
    expect(path.trace.assessmentConstructIds).toEqual(["construct.process-order"]);
    const causal = r.manifest.traceability.relationships.find((x) => x.type === "CAUSES")!;
    expect(causal.encodings.find((e) => e.ruleId === "causality.explanatory-progression")!.assessmentConstructIds).toEqual(["construct.causal"]);
  });
});
