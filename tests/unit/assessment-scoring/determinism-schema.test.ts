import { describe, expect, it } from "vitest";

import { derivedScoreSchema } from "@/features/research/contracts";
import {
  METRIC_VERSIONS,
  raterAgreement,
  resolveConfig,
  scoreConceptMap,
  scoreItemSchema,
  SCORING_PIPELINE_VERSION,
  toDerivedScores,
} from "@/features/assessment/scoring";

import { CATEGORIES, P1, R1, redge, shuffled } from "./fixtures";

describe("determinism", () => {
  it("input order of nodes, edges and reference edges does not change any output", () => {
    const a = scoreConceptMap(P1, R1, {}, { conceptCategories: CATEGORIES });
    const b = scoreConceptMap(
      { nodes: shuffled(P1.nodes, 2), edges: shuffled(P1.edges, 5) },
      { conceptIds: shuffled(R1.conceptIds), edges: shuffled(R1.edges, 1) },
      {},
      { conceptCategories: CATEGORIES },
    );
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("configuration key / equivalence order does not change parameters", () => {
    const x = scoreConceptMap(P1, R1, { typeEquivalences: [{ from: "ENABLES", to: "PRODUCES" }, { from: "DEPENDS_ON", to: "REQUIRES", reverse: true }] });
    const y = scoreConceptMap(P1, R1, { typeEquivalences: [{ from: "DEPENDS_ON", to: "REQUIRES", reverse: true }, { from: "ENABLES", to: "PRODUCES" }] });
    expect(JSON.stringify(x.parameters)).toBe(JSON.stringify(y.parameters));
  });

  it("rater order does not change agreement", () => {
    const a = { raterId: "a", edges: [redge("A", "B", "CAUSES", "expected"), redge("B", "C", "CAUSES", "expected")] };
    const b = { raterId: "b", edges: [redge("B", "C", "CAUSES", "expected"), redge("A", "C", "CAUSES", "expected")] };
    const c = { raterId: "c", edges: [redge("A", "B", "CAUSES", "expected")] };
    expect(JSON.stringify(raterAgreement([c, b, a]))).toBe(JSON.stringify(raterAgreement([a, b, c])));
  });

  it("re-scoring with the stored parameters reproduces the result", () => {
    const first = scoreConceptMap(P1, R1, { optionalMatch: "neutral", editCosts: { relabel: 0.5 } });
    const again = scoreConceptMap(P1, R1, resolveConfig(first.parameters as never));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
  });
});

describe("output schema", () => {
  const result = scoreConceptMap(P1, R1, {}, { conceptCategories: CATEGORIES });

  it("every score item validates and uses a registered metric version", () => {
    for (const s of result.scores) {
      expect(() => scoreItemSchema.parse(s)).not.toThrow();
      const family = Object.keys(METRIC_VERSIONS).find((f) => s.metricName === f || s.metricName.startsWith(`${f}.`)) as keyof typeof METRIC_VERSIONS;
      expect(family, s.metricName).toBeDefined();
      expect(s.metricVersion).toBe(METRIC_VERSIONS[family]);
    }
  });

  it("maps to derived_scores rows that satisfy the research contract", () => {
    const rows = toDerivedScores(result.scores, {
      sessionId: "00000000-0000-4000-8000-000000000001",
      assessmentId: "00000000-0000-4000-8000-000000000002",
      conceptMapId: "00000000-0000-4000-8000-000000000003",
      referenceMapId: "00000000-0000-4000-8000-000000000004",
    });
    expect(rows).toHaveLength(result.scores.length);
    for (const row of rows) {
      expect(() => derivedScoreSchema.parse(row)).not.toThrow();
      expect(row.pipelineVersion).toBe(SCORING_PIPELINE_VERSION);
      expect(row.details).toHaveProperty("parameters");
    }
  });
});
