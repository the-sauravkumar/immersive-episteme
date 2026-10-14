/**
 * Input and output types of concept-map scoring. Inputs are structural supersets of the
 * research contracts (`src/features/research/contracts.ts`): a `ConceptMapSubmission` is a
 * valid `ParticipantMapInput`, and parsed `referenceMapEdgeInputSchema` edges are valid
 * `ReferenceEdgeInput`s, so callers pass contract objects directly.
 */
import { z } from "zod";

import type { MatchLevel, ReferenceEdgeStatus } from "./config";

/** Participant map: nodes carry a concept id (null = free node); edges link node keys. */
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

/** One expert/reference edge, by concept id. `status` is a scoring extension (see report). */
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
  /** Concept set of the map (reference_maps.nodes[].conceptId). Edge endpoints are added to it. */
  conceptIds: ReadonlyArray<string>;
  edges: ReadonlyArray<ReferenceEdgeInput>;
}

/** Optional context: concept -> knowledge category code, for cross-category measures. */
export interface ScoringContext {
  conceptCategories?: Readonly<Record<string, string>>;
}

/** An edge after equivalence rewriting and orientation normalisation. */
export interface CanonicalEdge {
  /** Endpoint concept ids; for an undirected edge, source < target. */
  source: string;
  target: string;
  type: string | null;
  directed: boolean;
  /** Original type before any equivalence rewrite. */
  originalType: string | null;
  /** True when an equivalence rule swapped the endpoints. */
  reversedByEquivalence: boolean;
  /** Keys at the three match levels. */
  keys: Record<MatchLevel, string>;
}

export const PARTICIPANT_EDGE_CLASSES = [
  "correct",
  "optional_match",
  "wrong_type",
  "wrong_direction",
  "unsupported",
  "out_of_scope",
  "duplicate",
] as const;
export type ParticipantEdgeClass = (typeof PARTICIPANT_EDGE_CLASSES)[number];

export interface ParticipantEdgeBreakdown {
  edgeKey: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  sourceConceptId: string | null;
  targetConceptId: string | null;
  originalType: string | null;
  canonicalKey: string | null;
  class: ParticipantEdgeClass;
  /** Counted as a valid relationship. */
  valid: boolean;
  /** Counted as an incorrect relationship. */
  incorrect: boolean;
  outOfScopeReason?: "free_node" | "concept_not_in_reference" | "same_concept";
  /** What the edge matches at the validity level: an expected edge, only optional edges, or nothing. */
  matchAtValidityLevel: "expected" | "optional_only" | null;
  /** Highest level at which the edge matches any expected/optional reference edge, or null. */
  matchedLevel: MatchLevel | null;
  /** Canonical keys of the reference edges matched at `matchedLevel`. */
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
  /** Highest level at which some in-scope participant edge matches it, or null. */
  matchedLevel: MatchLevel | null;
  matchedBy: string[];
  /** Expected edge not matched at the validity level. */
  missing: boolean;
}

/** A single metric value with everything needed to explain and recompute it. */
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
