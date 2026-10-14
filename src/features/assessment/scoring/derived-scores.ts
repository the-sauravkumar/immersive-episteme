/**
 * Maps scoring output to `derived_scores` rows (contract: derivedScoreSchema). Pure: the caller
 * supplies the ids and persists the rows. `details` carries the parameters and the itemised
 * breakdown, so each stored row can be explained and recomputed on its own.
 */
import { derivedScoreSchema, type DerivedScore } from "@/features/research/contracts";

import { SCORING_PIPELINE_VERSION } from "./config";
import type { ScoreItem } from "./types";

export interface DerivedScoreIds {
  sessionId: string;
  assessmentId: string;
  conceptMapId?: string | null;
  responseId?: string | null;
  referenceMapId?: string | null;
  rubricId?: string | null;
}

/** JSON round-trip: drops undefined, guarantees the payload is what Postgres will store. */
function toJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function toDerivedScores(scores: ReadonlyArray<ScoreItem>, ids: DerivedScoreIds, pipelineVersion = SCORING_PIPELINE_VERSION): DerivedScore[] {
  return scores.map((s) =>
    derivedScoreSchema.parse({
      ...ids,
      metricName: s.metricName,
      metricVersion: s.metricVersion,
      value: s.value,
      details: toJson({ parameters: s.parameters, ...s.details }),
      pipelineVersion,
    }),
  );
}
