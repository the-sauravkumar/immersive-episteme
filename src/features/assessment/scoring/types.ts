import { z } from "zod";

import type { MatchLevel, ReferenceEdgeStatus } from "./config";

export interface ParticipantMapInput {
  nodes: ReadonlyArray<{ key: string; conceptId: string | null }>;
  edges: ReadonlyArray<{
    key: string;
    source: string;
    target: string;
    relationshipType?: string | null;
    directed?: boolean;
  }>;
}

export interface ReferenceEdgeInput {
  sourceConceptId: string;
  targetConceptId: string;
  relationshipTypeCode?: string | null;
  directed?: boolean;
  weight?: number;
  required?: boolean;
  status?: ReferenceEdgeStatus;
  notes?: string | null;
}

export interface ReferenceMapInput {
  conceptIds: ReadonlyArray<string>;
  edges: ReadonlyArray<ReferenceEdgeInput>;
}

export interface ScoringContext {
  conceptCategories?: Readonly<Record<string, string>>;
}

export interface CanonicalEdge {
  source: string;
  target: string;
  type: string | null;
  directed: boolean;
  originalType: string | null;
  reversedByEquivalence: boolean;
  keys: Record<MatchLevel, string>;
}
type ParticipantEdgeClass = "correct" | "optional_match" | "wrong_type" | "wrong_direction" | "unsupported" | "out_of_scope" | "duplicate";

export interface ParticipantEdgeBreakdown {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  sourceConceptId: string | null;
  targetConceptId: string | null;
  originalType: string | null;
  canonicalKey: string | null;
  class: ParticipantEdgeClass;
  valid: boolean;
  incorrect: boolean;
  outOfScopeReason?: "free_node" | "concept_not_in_reference" | "same_concept";
  matchAtValidityLevel: "expected" | "optional_only" | null;
  matchedLevel: MatchLevel | null;
  matchedReferenceKeys: string[];
  duplicateOf?: string;
}

export interface ReferenceEdgeBreakdown {
  canonicalKey: string;
  source: string;
  target: string;
  type: string | null;
  directed: boolean;
  status: Exclude<ReferenceEdgeStatus, "disputed"> | "disputed_as_optional";
  weight: number;
  matchedLevel: MatchLevel | null;
  matchedBy: string[];
  missing: boolean;
}

export const scoreItemSchema = z.object({
  metricName: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/),
  metricVersion: z.string().min(1).max(32),
  value: z.number().finite().nullable(),
  parameters: z.record(z.string(), z.unknown()),
  details: z.record(z.string(), z.unknown()),
});
export type ScoreItem = z.infer<typeof scoreItemSchema>;

export interface ConceptMapScoreResult {
  pipelineVersion: string;
  parameters: Record<string, unknown>;
  participantEdges: ParticipantEdgeBreakdown[];
  referenceEdges: ReferenceEdgeBreakdown[];
  scores: ScoreItem[];
}
