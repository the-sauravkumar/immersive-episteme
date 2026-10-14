/**
 * Layout configuration (mapping_rule_sets.config.layout) and the default mapping-rule set.
 *
 * Rules are data: researchers change which relationship types map to which spatial
 * strategy without touching layout or rendering code (requirements digest §5, MP:470).
 * A rule names its algorithm in `emit.params.strategy`; the strategy registry lives in
 * rules.ts. Everything numeric about the building (door widths, spacing, thresholds) is
 * in `layout` so the accessibility and complexity limits are versioned with the rule set.
 */
import { z } from "zod";

import type { MappingRuleSetConfig } from "@/features/spatial/contracts";
import { CONCEPT_TYPES, KNOWLEDGE_CATEGORY_CODES, RELATIONSHIP_SEMANTICS } from "@/lib/validation/enums";

const positive = z.number().positive();

export const complexityLimitsSchema = z.object({
  maxRooms: z.number().int().positive().default(40),
  maxDoorsPerRoom: z.number().int().positive().default(6),
  /** Door hops from the entrance lobby to the deepest room. */
  maxDoorHopsFromEntrance: z.number().int().positive().default(8),
  maxExhibitsPerRoom: z.number().int().positive().default(24),
  /** Longest room side (m); larger rooms are hard to scan. */
  maxRoomSide: positive.default(24),
  /** Longest single leg between consecutive stops of an ordered path (m). */
  maxPathLegLength: positive.default(60),
  /** "warning" reports breaches without failing the manifest; "error" fails it. */
  severity: z.enum(["warning", "error"]).default("warning"),
});

export const layoutConfigSchema = z
  .object({
    /** All room dimensions snap to this module (m). */
    gridUnit: positive.default(0.5),
    wallThickness: positive.default(0.2),
    wallHeight: positive.default(3.2),
    doorWidth: positive.default(1.5),
    doorHeight: positive.default(2.4),
    /** Accessibility floor for every doorway (m). */
    minDoorWidth: positive.default(0.9),
    /** Visitor collision radius used for reachability and routing (catalogue §4.3: 0.28). */
    visitorRadius: positive.default(0.28),
    exhibitWidth: positive.default(1.2),
    exhibitDepth: positive.default(0.6),
    exhibitHeight: positive.default(1.4),
    /** Gap between the wall face and the back of an exhibit. */
    wallGap: z.number().min(0).default(0.15),
    /** Wall length reserved per exhibit slot (centre-to-centre). */
    exhibitSpacing: positive.default(2.2),
    /** Distance in front of an exhibit where the visitor stands (path stops). */
    approachDistance: positive.default(1.2),
    /** Wall length kept free next to each inside corner. */
    cornerClearance: z.number().min(0).default(1.0),
    /** Wall length kept free on each side of a doorway. */
    doorClearance: z.number().min(0).default(0.6),
    minRoomSize: positive.default(7),
    hallDepth: positive.default(7),
    wingColumns: z.number().int().min(1).max(4).default(2),
    lobbyWidth: positive.default(8),
    lobbyDepth: positive.default(8),
    navResolution: positive.default(0.25),
    /** Two exhibits closer than this (approach to approach, m) count as adjacent. */
    adjacencyDistance: positive.default(3.5),
    // Render surfaces (docs/architecture/immersive-rendering-quality.md §1, check C6).
    /** Wall-mounted text panels and signs stand this far proud of the wall face (m). */
    panelOffset: z.number().min(0).default(0.003),
    /** Image planes stand this far proud of their panel (m). */
    imageOffset: z.number().min(0).default(0.003),
    /** Minimum stand-off of any wall-mounted plane from the surface behind it (1.5 mm). */
    minPanelOffset: positive.default(0.0015),
    /** Faces closer than this (and parallel, same facing) count as coplanar (1 mm). */
    coplanarTolerance: positive.default(0.001),
    /** Allowed relative difference between an image plane's w/h and the declared aspect. */
    aspectTolerance: positive.default(0.005),
    panelWidth: positive.default(1.0),
    panelBottom: positive.default(1.55),
    panelTop: positive.default(2.25),
    imageMaxWidth: positive.default(0.8),
    imageMaxHeight: positive.default(0.4),
    imageCenterY: positive.default(2.0),
    signBottom: positive.default(2.4),
    signTop: positive.default(2.7),
    /** Streaming: warn when one room (streaming unit) holds more exhibits than this. */
    unitExhibitBudget: z.number().int().positive().default(24),
    complexity: complexityLimitsSchema.default(complexityLimitsSchema.parse({})),
  })
  .strict();
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

/** Zone groups: the seven-part common template (requirements digest §3) plus open questions. */
export const DEFAULT_ZONE_GROUPS = [
  { id: "tradition_context", label: "Tradition and context", categories: ["tradition_identity", "geography_history"], scope: "wing" },
  { id: "materials_tools", label: "Materials and tools", categories: ["materials", "tools"], scope: "wing" },
  { id: "process_sequence", label: "Process sequence", categories: ["process_stages"], scope: "wing" },
  { id: "artisan_decisions", label: "Artisan decisions", categories: ["artisan_knowledge", "tacit_decisions"], scope: "wing" },
  { id: "design_outcomes", label: "Design and outcomes", categories: ["design_principles", "production_outcomes"], scope: "wing" },
  { id: "science_technology", label: "Science and environment", categories: ["scientific_mechanisms", "environmental_conditions"], scope: "wing" },
  { id: "open_questions", label: "Open questions and evidence", categories: ["open_questions", "supporting_evidence"], scope: "wing" },
  { id: "cross_tradition_comparison", label: "Cross-tradition comparison", categories: ["cross_tradition_comparisons"], scope: "hall" },
] as const;

export const zoneGroupSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1),
  categories: z.array(z.enum(KNOWLEDGE_CATEGORY_CODES)).min(1),
  /** "wing": one room per tradition wing; "hall": the shared comparison hall. */
  scope: z.enum(["wing", "hall"]),
});
export type ZoneGroup = z.infer<typeof zoneGroupSchema>;

export const categoryZoneParamsSchema = z.object({
  strategy: z.literal("category-zone"),
  groups: z.array(zoneGroupSchema).min(1),
  entranceGroup: z.string(),
  fallbackGroup: z.string(),
  sharedZoneLabel: z.string().default("Shared science commons"),
});

/** The default rule set ("knowledge-to-space v1"). Every row is an explicit, editable rule. */
export function defaultRuleSetConfig(): MappingRuleSetConfig {
  return {
    schemaVersion: 1,
    layout: {},
    rules: [
      {
        id: "containment.tradition-wing",
        description:
          "Same tradition -> shared wing. Each selected tradition becomes one wing (zone); BELONGS_TO is encoded as containment of the exhibit inside its tradition's wing.",
        match: { conceptTypes: ["tradition"], relationshipTypes: ["BELONGS_TO"] },
        emit: { kind: "zone", encoding: "containment", params: { strategy: "tradition-wing" } },
        priority: 10,
      },
      {
        id: "classification.zone",
        description:
          "Classification -> zone. Knowledge categories become distinguishable rooms inside each wing (grouped by the common template); each category keeps a contiguous, labelled wall run.",
        match: { conceptTypes: [...CONCEPT_TYPES] },
        emit: {
          kind: "room",
          encoding: "containment",
          params: {
            strategy: "category-zone",
            groups: DEFAULT_ZONE_GROUPS.map((g) => ({ ...g, categories: [...g.categories] })),
            entranceGroup: "tradition_context",
            fallbackGroup: "open_questions",
            sharedZoneLabel: "Shared science commons",
          },
        },
        priority: 0,
      },
      {
        id: "layout.circulation",
        description:
          "Circulation. Entrance lobby, comparison hall and a spanning set of doorways so every room is reachable; doorway widths obey the accessibility minimum.",
        match: { conceptTypes: [...CONCEPT_TYPES] },
        emit: { kind: "portal", params: { strategy: "circulation" } },
        priority: 0,
      },
      {
        id: "sequence.path",
        description:
          "Sequence -> path. PRECEDES chains become ordered, traversable paths: stations are placed consecutively in ordinal order and a routed path visits them in that order.",
        match: { relationshipTypes: ["PRECEDES"] },
        emit: { kind: "path", encoding: "sequence_path", params: { strategy: "sequence-path" } },
        priority: 10,
      },
      {
        id: "dependency.threshold",
        description:
          "Dependency -> threshold. DEPENDS_ON / REQUIRES become a threshold cue: on the doorway between the two rooms when one exists, otherwise at the dependent exhibit, naming the prerequisite.",
        match: { relationshipTypes: ["DEPENDS_ON", "REQUIRES"] },
        emit: { kind: "cue", encoding: "threshold", params: { strategy: "threshold" } },
        priority: 10,
      },
      {
        id: "association.adjacency",
        description:
          "Association -> adjacency. SIMILAR_TO / USES / associative links inside one room are placed in neighbouring wall slots; otherwise they become an explicit link hotspot.",
        match: { relationshipTypes: ["SIMILAR_TO", "CONTRASTS_WITH", "USES"], semantics: ["associative"] },
        emit: { kind: "exhibit", encoding: "adjacency", params: { strategy: "adjacency" } },
        priority: 5,
      },
      {
        id: "comparison.connected-zones",
        description:
          "Comparison -> connected zones. Cross-tradition SIMILAR_TO / CONTRASTS_WITH and comparison concepts are juxtaposed in the shared comparison hall that connects the compared wings.",
        match: { relationshipTypes: ["SIMILAR_TO", "CONTRASTS_WITH"], conceptTypes: ["comparison"] },
        emit: { kind: "path", encoding: "juxtaposition", params: { strategy: "comparison-zone", minTraditions: 2 } },
        priority: 20,
      },
      {
        id: "causality.explanatory-progression",
        description:
          "Causality -> explanatory progression. Causal links (CAUSES, ENABLES, PRODUCES, AFFECTED_BY) become an explanation trigger on the cause exhibit with a routed progression to the effect. Never proximity alone.",
        match: { semantics: ["causal"] },
        emit: {
          kind: "cue",
          encoding: "explicit_link",
          params: { strategy: "explanation-trigger", causeIsTarget: ["AFFECTED_BY"] },
        },
        priority: 10,
      },
      {
        id: "science.contextual-depth",
        description:
          "Scientific explanation -> contextual depth. SCIENTIFICALLY_EXPLAINED_BY adds a progressive-disclosure science layer to the explained exhibit.",
        match: { relationshipTypes: ["SCIENTIFICALLY_EXPLAINED_BY"] },
        emit: {
          kind: "exhibit",
          encoding: "layer",
          params: { strategy: "progressive-layer", explainer: "target", layerKinds: { SCIENTIFICALLY_EXPLAINED_BY: "science" } },
        },
        priority: 10,
      },
      {
        id: "explanation.contextual-depth",
        description:
          "Practitioner / general explanation -> contextual depth. PRACTITIONER_EXPLAINS and EXPLAINS add a disclosure layer to the explained exhibit.",
        match: { relationshipTypes: ["PRACTITIONER_EXPLAINS", "EXPLAINS"] },
        emit: {
          kind: "exhibit",
          encoding: "layer",
          params: {
            strategy: "progressive-layer",
            explainer: "source",
            layerKinds: { PRACTITIONER_EXPLAINS: "practitioner", EXPLAINS: "explanation" },
          },
        },
        priority: 10,
      },
      {
        id: "cross-category.connection",
        description:
          "Cross-category relationship -> architectural connection. Rooms of one wing whose concepts are related are placed side by side and joined by a doorway that records the relationships it carries.",
        match: { semantics: [...RELATIONSHIP_SEMANTICS] },
        emit: { kind: "portal", encoding: "adjacency", params: { strategy: "architectural-connection" } },
        priority: 0,
      },
    ],
  };
}

export const DEFAULT_RULE_SET = {
  name: "knowledge-to-space-default",
  version: 1,
} as const;
