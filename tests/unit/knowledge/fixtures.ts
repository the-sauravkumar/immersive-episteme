/** Fixture snapshot for the 2D tests, from the placeholder knowledge-graph fixtures (no craft facts). */
import { buildBundle } from "@/features/knowledge/graph/snapshot";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { createKnowledgeView } from "@/features/knowledge/read/view";

import { alphaFile, claim, comparisonsFile, concept, load, rel } from "../knowledge-graph/fixtures";

/** Fixture snapshot: tradition "alpha", a copy named "beta", and a comparison across both. */
export function fixtureView() {
  const beta = JSON.parse(JSON.stringify(alphaFile()).replaceAll("alpha", "beta").replaceAll("Alpha", "Beta")) as Record<string, unknown>;
  const comparisons = comparisonsFile();
  (comparisons.concepts as unknown[]).push(
    concept("comparisons.comparison.alpha-beta", "cross_tradition_comparisons", "Alpha and Beta compared", [claim("Compared across traditions.", ["alpha:S1"])], {
      compares: ["alpha.process_stage.stage-one", "beta.process_stage.stage-one"],
    }),
  );
  (comparisons.relationships as unknown[]).push(rel("alpha.process_stage.stage-one", "SIMILAR_TO", "beta.process_stage.stage-one", { source_ids: ["alpha:S1"] }));
  const bundle = buildBundle(load(alphaFile(), beta, comparisons), {
    hasher: nodeSha256,
    versionLabel: "review-test",
    generatedAt: "2026-01-01T00:00:00.000Z",
    includesUnverified: true,
  });
  return createKnowledgeView(bundle);
}

