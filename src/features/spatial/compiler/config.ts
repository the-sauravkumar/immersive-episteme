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

import { KNOWLEDGE_SECTIONS, typesOfSection } from "@/features/learning/sections";
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
    /**
     * 2.35 (was 2.25, DR-043): the plate is 0.8 m tall so a sequence station's "Step n of N" line can be
     * set at the title size (readable from across the room) without cutting a title line.
     */
    panelTop: positive.default(2.35),
    imageMaxWidth: positive.default(0.8),
    imageMaxHeight: positive.default(0.4),
    imageCenterY: positive.default(2.0),
    /**
     * Wing room order: "template" follows the rule set's group order (the 2D section order);
     * "connection" places groups by cross-category relationship weight (seeded tie-breaks).
     */
    groupOrder: z.enum(["template", "connection"]).default("template"),
    /**
     * Building scheme (layout.ts). "row": the wings side by side along one comparison hall, the lobby
     * at its west end (rule sets v1, v2). "hub": the entrance lobby is the hub, the wings open off
     * its west, south and east walls at the same walking distance from the spawn, and the comparison
     * hall lies north of it (rule set v3, DR-043).
     */
    building: z.enum(["row", "hub"]).default("row"),
    /**
     * Hub: the spawn's distance from the lobby's north wall, where the entrance directory hangs; the
     * directory's reading distance (src/features/immersive/wayfinding.ts DIRECTORY.readingDistance),
     * so a visitor reads it from the spawn without walking up to it.
     */
    hubSpawnDepth: positive.default(3.5),
    /** Hub: wall kept free for the directory on the lobby's north wall (its rows plus clearance, m). */
    hubDirectoryWidth: positive.default(3.4),
    /**
     * How an exhibit's plate is mounted (DR-045). "plinth": the plate hangs on the wall at
     * panelBottom-panelTop above a solid plinth that fills the exhibit footprint (rule sets v1-v3).
     * "stand": the plate stands on a reading stand at the front face of the same footprint, at
     * standPanelBottom-standPanelTop, so it is 1.2 m (approachDistance) from the approach point
     * instead of 1.95 m and centred near eye height; the footprint, approach point and every
     * walking route are unchanged (rule set v4).
     */
    exhibitMount: z.enum(["plinth", "stand"]).default("plinth"),
    /** Stand mount: the plate's lower and upper edge (m); 0.8 m tall like the wall plate. */
    standPanelBottom: positive.default(1.15),
    standPanelTop: positive.default(1.95),
    /** Stand mount: the board that carries the plate overhangs it by this much on every side (m). */
    standBoardMargin: positive.default(0.03),
    /**
     * Category signs share one band with the museum's doorway signs (src/features/immersive/
     * placement.ts DOOR_SIGN: door height + 0.08 m gap, 0.30 m tall), so all signage lines up.
     */
    signBottom: positive.default(2.48),
    signTop: positive.default(2.78),
    /** Streaming: warn when one room (streaming unit) holds more exhibits than this. */
    unitExhibitBudget: z.number().int().positive().default(24),
    complexity: complexityLimitsSchema.default(complexityLimitsSchema.parse({})),
  })
  .strict();
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;

/**
 * Zone groups, derived from THE section map shared with the 2D pages (src/features/learning/
 * sections.ts, DR-024): one wing room per section, in the section order, named by the section
 * title; the cross-tradition section is the comparison hall. A concept's room is chosen by its
 * TYPE (`types`, the same mapping as the 2D `sectionOfType`), so every concept is in the same
 * section in both conditions; `categories` only order the category runs inside a room.
 */
export const DEFAULT_ZONE_GROUPS = KNOWLEDGE_SECTIONS.map((s) => ({
  id: s.zoneGroup,
  label: s.title,
  types: typesOfSection(s),
  categories: [...s.categories],
  scope: s.scope,
}));

export const zoneGroupSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1),
  categories: z.array(z.enum(KNOWLEDGE_CATEGORY_CODES)).min(1),
  /**
   * Concept types placed in this group. When any group of the rule set lists types, a concept's
   * group is chosen by its type (DR-024: the 2D section of the type) and `categories` only order the
   * runs inside the room; rule sets without types (version 1) group by category.
   */
  types: z.array(z.enum(CONCEPT_TYPES)).min(1).optional(),
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
    // Version 3 (DR-043): the hub building, so every wing is equally far from the spawn.
    // Version 4 (DR-045): plates on identical reading stands instead of the wall above empty plinths.
    layout: { building: "hub", exhibitMount: "stand" },
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
          "Classification -> zone. The sections of the common template (the section map shared with the 2D pages) become distinguishable rooms inside each wing; a concept's room follows its type, exactly as its 2D section does; each category keeps a contiguous, labelled wall run inside the room.",
        match: { conceptTypes: [...CONCEPT_TYPES] },
        emit: {
          kind: "room",
          encoding: "containment",
          params: {
            strategy: "category-zone",
            groups: DEFAULT_ZONE_GROUPS.map((g) => ({ ...g, types: [...g.types], categories: [...g.categories] })),
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

/**
 * Version 2 (DR-024): zone groups derived from the shared section map; rooms chosen by concept type.
 * Version 3 (DR-043): the hub building (`layout.building: "hub"`), wings equally far from the spawn.
 * Version 4 (DR-045): plates on reading stands (`layout.exhibitMount: "stand"`).
 */
export const DEFAULT_RULE_SET = {
  name: "knowledge-to-space-default",
  version: 4,
} as const;
