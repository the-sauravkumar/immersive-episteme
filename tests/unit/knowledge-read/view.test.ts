/**
 * Knowledge read view (src/features/knowledge/read/view.ts) over a bundle built from the
 * placeholder fixtures (no craft facts).
 */
import { describe, expect, it } from "vitest";

import { buildBundle } from "../../../src/features/knowledge/graph/snapshot";
import { nodeSha256 } from "../../../src/features/knowledge/graph/hash-node";
import { createKnowledgeView } from "../../../src/features/knowledge/read/view";
import { alphaFile, comparisonsFile, load, rel } from "../knowledge-graph/fixtures";

function view(extraRels: Record<string, unknown>[] = []) {
  const alpha = alphaFile();
  (alpha.relationships as unknown[]).push(...extraRels);
  const bundle = buildBundle(load(alpha, comparisonsFile()), {
    hasher: nodeSha256,
    versionLabel: "review-test",
    generatedAt: "2026-10-14T00:00:00.000Z",
    includesUnverified: true,
  });
  return createKnowledgeView(bundle);
}

describe("knowledge read view", () => {
  it("lists traditions with concept counts and reports the unverified flag", () => {
    const v = view();
    expect(v.listTraditions().map((t) => [t.slug, t.conceptCount])).toEqual([["alpha", 6]]);
    expect(v.info()).toMatchObject({ versionLabel: "review-test", includesUnverified: true, counts: { traditions: 1, concepts: 7 } });
  });

  it("returns a tradition with GI sources, overview concept and concepts grouped by type", () => {
    const t = view().getTradition("alpha")!;
    expect(t.overviewConcept?.key).toBe("alpha.tradition.alpha");
    expect(t.gi?.sources.map((s) => s.title)).toEqual(["Placeholder source S1"]);
    expect(t.conceptsByType.process_stage?.map((c) => c.key)).toEqual([
      "alpha.process_stage.stage-one",
      "alpha.process_stage.stage-three",
      "alpha.process_stage.stage-two",
    ]);
    expect(view().getTradition("nope")).toBeNull();
  });

  it("resolves a concept by key, slug or id with claims, evidence and an evidence summary", () => {
    const v = view();
    const byKey = v.getConcept("alpha.tool.tool-b")!;
    expect(v.getConcept(byKey.slug)?.id).toBe(byKey.id);
    expect(v.getConcept(byKey.id)?.key).toBe(byKey.key);
    expect(byKey.claims).toHaveLength(1);
    expect(byKey.claims[0]!.evidence.map((e) => e.reliability).sort()).toEqual(["high", "low"]);
    expect(byKey.sources).toHaveLength(2);
    expect(byKey.evidenceSummary).toEqual({
      claims: 1,
      sourcedClaims: 1,
      byProvenance: { historical_documentation: 1 },
      byReliability: { high: 1, low: 1 },
    });
    expect(byKey.tradition?.slug).toBe("alpha");
    expect(v.getConcept("alpha.tool.missing")).toBeNull();
  });

  it("orders the process chain by PRECEDES ordinal and keeps unordinalled edges apart", () => {
    const loop = rel("alpha.process_stage.stage-three", "PRECEDES", "alpha.process_stage.stage-one", { ordinal: null, conditions: "Repeat loop for a second cycle." });
    const chain = view([loop]).getProcessChain("alpha")!;
    expect(chain.steps.map((s) => s.key)).toEqual(["alpha.process_stage.stage-one", "alpha.process_stage.stage-two", "alpha.process_stage.stage-three"]);
    expect(chain.links.map((l) => l.ordinal)).toEqual([1, 2]);
    expect(chain.continuous).toBe(true);
    expect(chain.unorderedLinks).toHaveLength(1);
    expect(chain.otherSequences).toEqual([]);
  });

  it("groups typed, directed relations by semantics class with direction-aware labels", () => {
    const groups = view().getRelatedConcepts("alpha.process_stage.stage-two")!;
    expect(groups.map((g) => g.semantics)).toEqual(["sequential", "compositional"]);
    const seq = groups.find((g) => g.semantics === "sequential")!.relations;
    expect(seq.map((r) => [r.direction, r.concept.key])).toEqual([
      ["incoming", "alpha.process_stage.stage-one"],
      ["outgoing", "alpha.process_stage.stage-three"],
    ]);
    expect(seq[0]!.label).not.toBe(seq[1]!.label);
    expect(seq.every((r) => r.evidence.length === 1)).toBe(true);
  });

  it("lists comparisons with the compared concepts, filterable by tradition", () => {
    const v = view();
    const all = v.getComparisons();
    expect(all).toHaveLength(1);
    expect(all[0]!.compares.map((c) => c.key)).toEqual(["alpha.process_stage.stage-one", "alpha.process_stage.stage-two"]);
    expect(v.getComparisons({ traditionSlug: "alpha" })).toHaveLength(1);
    expect(v.getComparisons({ traditionSlug: "nope" })).toEqual([]);
  });
});
