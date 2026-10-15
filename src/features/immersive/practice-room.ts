/**
 * The 3D familiarisation practice room (study decision D5: content-free practice of the
 * pathway's controls). A FIXED practice graph with no craft content, compiled by the same
 * spatial compiler and default rule set as the learning museum, mapped by the same
 * `buildSceneModel`, and rendered by the same runtime (renderer, controls, information panel,
 * minimap). Every title and text is interface wording labelled "Practice"; there are no sources
 * and no citations. Deterministic: the same input always gives the same manifest (unit-tested).
 *
 * Node-only (name-based ids use node:crypto); the practice page builds it on the server.
 */
import { nameBasedUuid } from "@/features/knowledge/graph/hash";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { compileSpatialManifest, DEFAULT_RULE_SET, defaultRuleSetConfig, ruleSetUuid, type CompilerGraph } from "@/features/spatial/compiler";
import type { ConceptType, KnowledgeCategoryCode } from "@/lib/validation/enums";

import { buildSceneModel } from "./scene-model";
import type { ImmersiveSettings, MuseumPayload, PanelConcept, PanelRelation } from "./types";

export const PRACTICE_VERSION_LABEL = "practice-room-v1";
export const PRACTICE_TRADITION_SLUG = "practice";

const id = (...parts: string[]) => nameBasedUuid(nodeSha256, "practice-room", ...parts);

interface PracticeConcept {
  key: string;
  type: ConceptType;
  category: KnowledgeCategoryCode;
  title: string;
}

/** The practice exhibits: an entrance, two objects and a three-step sequence (walk the path, follow links). */
const CONCEPTS: readonly PracticeConcept[] = [
  { key: "practice.tradition", type: "tradition", category: "tradition_identity", title: "Practice room" },
  { key: "practice.exhibit-a", type: "material", category: "materials", title: "Practice exhibit A" },
  { key: "practice.exhibit-b", type: "tool", category: "tools", title: "Practice exhibit B" },
  { key: "practice.step-1", type: "process_stage", category: "process_stages", title: "Practice step 1" },
  { key: "practice.step-2", type: "process_stage", category: "process_stages", title: "Practice step 2" },
  { key: "practice.step-3", type: "process_stage", category: "process_stages", title: "Practice step 3" },
];

const RELATIONSHIPS = [
  { key: "step-1-precedes-step-2", source: "practice.step-1", target: "practice.step-2", type: "PRECEDES", ordinal: 1 },
  { key: "step-2-precedes-step-3", source: "practice.step-2", target: "practice.step-3", type: "PRECEDES", ordinal: 2 },
  { key: "step-1-uses-exhibit-a", source: "practice.step-1", target: "practice.exhibit-a", type: "USES", ordinal: null },
  { key: "step-2-uses-exhibit-b", source: "practice.step-2", target: "practice.exhibit-b", type: "USES", ordinal: null },
] as const;

/** Relationship labels as in the reference data (db/seeds/reference-data.ts). */
const REL_TYPES = {
  PRECEDES: { label: "precedes", inverseLabel: "follows", semantics: "sequential", directed: true, ordered: true, allowsCycles: true },
  USES: { label: "uses", inverseLabel: "is used in", semantics: "compositional", directed: true, ordered: false, allowsCycles: true },
} as const;

/** Interface text of every practice panel (no craft content). */
export const PRACTICE_CLAIMS = [
  "Practice text. In the learning task, this panel shows what the sources say about the exhibit.",
  "Practice text. Use the tabs and the connections below to move between related exhibits.",
] as const;

function practiceGraph(): CompilerGraph {
  const traditionId = id("tradition");
  const cid = (key: string) => id("concept", key);
  return {
    versionLabel: PRACTICE_VERSION_LABEL,
    categories: [
      { code: "tradition_identity", label: "Tradition identity", templateGroup: "tradition_context", position: 1 },
      { code: "materials", label: "Materials", templateGroup: "materials_tools", position: 5 },
      { code: "tools", label: "Tools", templateGroup: "materials_tools", position: 6 },
      { code: "process_stages", label: "Process stages", templateGroup: "process_sequence", position: 7 },
    ],
    relationshipTypes: Object.entries(REL_TYPES).map(([code, t]) => ({ code, label: t.label, semantics: t.semantics, directed: t.directed, ordered: t.ordered, allowsCycles: t.allowsCycles })),
    traditions: [{ id: traditionId, slug: PRACTICE_TRADITION_SLUG, name: "Practice" }],
    concepts: CONCEPTS.map((c) => ({ id: cid(c.key), key: c.key, type: c.type, category: c.category, traditionId, title: c.title, summary: null, compares: [] })),
    // Bundle relationships name their endpoints by concept key.
    relationships: RELATIONSHIPS.map((r) => ({ id: id("relationship", r.key), source: r.source, target: r.target, type: r.type, explanation: null, ordinal: r.ordinal })),
  } as unknown as CompilerGraph;
}

let cached: Omit<MuseumPayload, "settings"> | null = null;

/** The practice museum's data (same shape as the learning museum's), with the study's settings. */
export function practiceMuseumPayload(settings: ImmersiveSettings): MuseumPayload {
  cached ??= buildPracticeRoom();
  return { ...cached, settings };
}

/** Compiles the practice room afresh (practiceMuseumPayload caches it). */
export function buildPracticeRoom(): Omit<MuseumPayload, "settings"> {
  const graph = practiceGraph();
  const compiled = compileSpatialManifest({
    graph,
    snapshotVersion: PRACTICE_VERSION_LABEL,
    traditions: [PRACTICE_TRADITION_SLUG],
    ruleSet: { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config: defaultRuleSetConfig() },
    seed: "practice",
  });
  const scene = buildSceneModel(compiled.manifest);
  const byKey = new Map(graph.concepts.map((c) => [c.key, c]));
  const concepts: Record<string, PanelConcept> = {};
  for (const c of graph.concepts) {
    const related = new Map<string, PanelRelation[]>();
    for (const r of graph.relationships) {
      if (r.source !== c.key && r.target !== c.key) continue;
      const outgoing = r.source === c.key;
      const other = byKey.get(outgoing ? r.target : r.source)!;
      const t = REL_TYPES[r.type as keyof typeof REL_TYPES];
      const list = related.get(t.semantics) ?? [];
      list.push({
        relationshipId: r.id,
        type: r.type,
        semantics: t.semantics,
        direction: outgoing ? "outgoing" : "incoming",
        label: outgoing ? t.label : t.inverseLabel,
        conceptId: other.id,
        conceptTitle: other.title,
        conceptType: other.type,
        conceptTraditionSlug: PRACTICE_TRADITION_SLUG,
        explanation: null,
        conditions: null,
        statedBy: [],
      });
      related.set(t.semantics, list);
    }
    concepts[c.id] = {
      id: c.id,
      key: c.key,
      title: c.title,
      type: c.type,
      category: c.category,
      traditionId: c.traditionId ?? null,
      traditionSlug: PRACTICE_TRADITION_SLUG,
      localTerms: [],
      // Shown as the panel badge ("Practice").
      verificationState: "practice",
      claims: PRACTICE_CLAIMS.map((text, i) => ({ id: id("claim", c.key, String(i)), position: i, text, evidence: [] })),
      comparison: null,
      related: [...related.entries()].map(([semantics, relations]) => ({ semantics: semantics as PanelRelation["semantics"], relations })),
    };
  }
  return {
    manifestId: id("manifest", compiled.manifestHash),
    manifestHash: compiled.manifestHash,
    snapshotId: id("snapshot", PRACTICE_VERSION_LABEL),
    scene,
    concepts,
    sources: {},
    traditions: graph.traditions.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    missingConceptIds: [],
  };
}
