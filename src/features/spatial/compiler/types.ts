/**
 * Compiler input and output types. The input graph is a structural subset of the knowledge
 * bundle (src/features/knowledge/contracts.ts `KnowledgeBundle`), so a published snapshot
 * payload can be passed in directly. The output elements conform to
 * `manifestElementSchema` (src/features/spatial/contracts.ts) and carry the compiler's
 * geometry and traceability as additional (loose) members.
 */
import type { z } from "zod";

import type {
  bundleCategorySchema,
  bundleConceptSchema,
  bundleRelationshipSchema,
  bundleRelationshipTypeSchema,
  bundleTraditionSchema,
} from "@/features/knowledge/contracts";
import type { MappingRuleSetConfig, SPATIAL_ENCODINGS } from "@/features/spatial/contracts";
import type { SpatialElementKind } from "@/lib/validation/enums";

export type SpatialEncoding = (typeof SPATIAL_ENCODINGS)[number];
type BundleConcept = z.infer<typeof bundleConceptSchema>;
type BundleRelationship = z.infer<typeof bundleRelationshipSchema>;

export type GraphConcept = Pick<
  BundleConcept,
  "id" | "key" | "type" | "category" | "traditionId" | "title" | "summary" | "compares"
> & { assetIds?: string[]; verificationState?: string };
export type GraphRelationship = Pick<
  BundleRelationship,
  "id" | "source" | "target" | "type" | "explanation" | "ordinal"
> & { strength?: number | null; verificationState?: string };
export type GraphRelationshipType = Pick<
  z.infer<typeof bundleRelationshipTypeSchema>,
  "code" | "label" | "semantics" | "directed" | "ordered" | "allowsCycles"
>;
export type GraphTradition = Pick<z.infer<typeof bundleTraditionSchema>, "id" | "slug" | "name">;
export type GraphCategory = Pick<z.infer<typeof bundleCategorySchema>, "code" | "label" | "templateGroup" | "position">;

/** What the compiler reads from a published knowledge snapshot. `KnowledgeBundle` satisfies it. */
export interface CompilerGraph {
  versionLabel: string;
  categories: readonly GraphCategory[];
  relationshipTypes: readonly GraphRelationshipType[];
  traditions: readonly GraphTradition[];
  concepts: readonly GraphConcept[];
  relationships: readonly GraphRelationship[];
}

/** An exhibit asset available for a concept (image, model, diagram ...). */
export interface ExhibitAsset {
  id: string;
  conceptId: string;
  kind: string;
  uri: string;
  title?: string | null;
  licence?: string | null;
  /** Source pixel dimensions; when both are known the image plane is sized to their aspect. */
  width?: number | null;
  height?: number | null;
}

export interface CompileInput {
  graph: CompilerGraph;
  /** Version label of the published snapshot this compile claims to use (must match graph.versionLabel). */
  snapshotVersion: string;
  /** Selected tradition slugs. Order does not matter (wings are laid out in slug order). */
  traditions: readonly string[];
  ruleSet: { id: string; name: string; version: number; config: unknown };
  seed: string;
  assets?: readonly ExhibitAsset[];
  /** Optional assessment-construct ids per rule id (closes the traceability chain). */
  assessmentConstructs?: Readonly<Record<string, readonly string[]>>;
}

// -----------------------------------------------------------------------------------------
// Geometry. World convention (design-reuse catalogue §4.3): 1 unit = 1 m, +y up, x east,
// z south, compass yaw 0 = north (-z), 90 = east.
// -----------------------------------------------------------------------------------------

export type Vec3 = [number, number, number];
export interface Point {
  x: number;
  z: number;
}
/** Axis-aligned rectangle on the floor plane (wall centre lines for rooms). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
/**
 * Axis-aligned collider. Adapted from virtual-walkthrough src/museum/config/layout.ts `WallBox`
 * (string ids, min/max Vec3; v1 runtime collision is AABB-only).
 */
export interface Collider {
  id: string;
  kind: "wall" | "post" | "plinth";
  min: Vec3;
  max: Vec3;
}

export type Side = "n" | "e" | "s" | "w";

export type InteractionEvent =
  | "room_entered"
  | "exhibit_selected"
  | "information_layer_opened"
  | "knowledge_layer_selected"
  | "relationship_followed"
  | "tradition_crossed"
  | "guidance_cue_used"
  | "concept_encountered";

export interface Interaction {
  /** Telemetry event code (src/features/telemetry/contracts.ts EVENT_TYPE_REGISTRY). */
  event: InteractionEvent;
  action: string;
}

export interface ElementTrace {
  conceptIds: string[];
  relationshipIds: string[];
  ruleIds: string[];
  interactions: Interaction[];
  assessmentConstructIds: string[];
}

export interface Encoding {
  relationshipId: string;
  ruleId: string;
  encoding: SpatialEncoding;
}

export interface Hotspot {
  id: string;
  kind: "inspect" | "link" | "compare";
  label: string;
  targetElementId: string | null;
  relationshipId: string | null;
  ruleId: string;
}

export interface Layer {
  id: string;
  kind: "science" | "practitioner" | "explanation";
  /** Order of disclosure (1 = first layer behind the exhibit's summary). */
  depth: number;
  conceptId: string;
  conceptKey: string;
  relationshipId: string;
  ruleId: string;
  /** Exhibit presenting the explaining concept, when it is placed. */
  linkedElementId: string | null;
}

/** One manifest element. Base fields match `manifestElementSchema`; the rest is loose. */
export interface CompiledElement {
  id: string;
  kind: SpatialElementKind;
  parentId: string | null;
  conceptId: string | null;
  ruleId: string;
  label: string | null;
  encodes: Encoding[];
  rationale: string;
  trace: ElementTrace;
  [extra: string]: unknown;
}

export interface CompiledManifest {
  schemaVersion: 1;
  snapshotVersion: string;
  ruleSet: { id: string; name: string; version: number; configSha256: string };
  compilerVersion: string;
  layoutVersion: string;
  seed: string;
  units: "m";
  selection: { traditions: string[] };
  accessibility: { minDoorWidth: number; visitorRadius: number };
  elements: CompiledElement[];
  traceability: TraceabilityIndex;
}

export interface RelationshipTrace {
  relationshipId: string;
  type: string;
  semantics: string | null;
  sourceConceptId: string | null;
  targetConceptId: string | null;
  primaryRuleId: string | null;
  status: "encoded" | "unencoded";
  reason: string | null;
  encodings: {
    ruleId: string;
    encoding: SpatialEncoding;
    elementIds: string[];
    interaction: Interaction;
    assessmentConstructIds: string[];
  }[];
}

export interface ConceptTrace {
  conceptId: string;
  key: string;
  status: "placed" | "out_of_scope" | "unplaced";
  elementId: string | null;
  reason: string | null;
}

export interface TraceabilityIndex {
  relationships: RelationshipTrace[];
  concepts: ConceptTrace[];
}

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  details?: { severity: "error" | "warning"; issues: string[]; [k: string]: unknown };
}

export interface ManifestValidation {
  passed: boolean;
  checks: ValidationCheck[];
  coverage: {
    concepts: { total: number; placed: number };
    relationships: { total: number; encoded: number };
  };
}

export interface CompileResult {
  manifest: CompiledManifest;
  manifestHash: string;
  validation: ManifestValidation;
}

export type { MappingRuleSetConfig };
