/**
 * Shared fixtures for the spatial compiler tests: the real curated content (content/) and a
 * small synthetic graph for fault injection.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWLEDGE_CATEGORIES, RELATIONSHIP_TYPES } from "@db/seeds/reference-data";
import {
  compileSpatialManifest,
  conceptUuid,
  contentToGraph,
  DEFAULT_RULE_SET,
  defaultRuleSetConfig,
  relationshipUuid,
  ruleSetUuid,
  traditionUuid,
  type CompileInput,
  type CompileResult,
  type CompilerGraph,
  type GraphConcept,
  type GraphRelationship,
} from "@/features/spatial/compiler";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const DEFAULT_TRADITIONS = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"] as const;

export const VOCAB = {
  categories: KNOWLEDGE_CATEGORIES.map((c, i) => ({ code: c.code, label: c.label, templateGroup: c.templateGroup, position: i + 1 })),
  relationshipTypes: RELATIONSHIP_TYPES.map((t) => ({
    code: t.code,
    label: t.label,
    semantics: t.semantics,
    directed: t.directed,
    ordered: t.ordered,
    allowsCycles: t.allowsCycles,
  })),
};

let cached: ReturnType<typeof contentToGraph> | null = null;
export function loadContent() {
  if (cached) return cached;
  const read = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
  const tdir = path.join(ROOT, "content", "traditions");
  const traditions = readdirSync(tdir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .map((s) => read(path.join(tdir, s, "tradition.json")));
  const sdir = path.join(ROOT, "content", "shared");
  const shared = [
    ...readdirSync(sdir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => read(path.join(sdir, f))),
    read(path.join(ROOT, "content", "comparisons.json")),
  ];
  cached = contentToGraph({ traditions, shared }, VOCAB);
  if (cached.problems.length) throw new Error(cached.problems.join("\n"));
  return cached;
}

export function defaultRuleSet(config = defaultRuleSetConfig()) {
  return { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config };
}

export function contentInput(overrides: Partial<CompileInput> = {}): CompileInput {
  const content = loadContent();
  return {
    graph: content.graph,
    snapshotVersion: content.graph.versionLabel,
    traditions: [...DEFAULT_TRADITIONS],
    ruleSet: defaultRuleSet(),
    seed: "seed-a",
    assets: content.assets,
    ...overrides,
  };
}

const compiledBySeed = new Map<string, CompileResult>();
export function compileContent(seed = "seed-a"): CompileResult {
  const hit = compiledBySeed.get(seed);
  if (hit) return hit;
  const r = compileSpatialManifest(contentInput({ seed }));
  compiledBySeed.set(seed, r);
  return r;
}

// -----------------------------------------------------------------------------------------
// Synthetic graph (demo-style keys; not craft facts).
// -----------------------------------------------------------------------------------------

type C = Pick<GraphConcept, "key" | "type" | "category"> & { tradition: string | null; compares?: string[] };
type R = Pick<GraphRelationship, "source" | "target" | "type"> & { ordinal?: number | null };

export function syntheticGraph(extra: { concepts?: C[]; relationships?: R[]; drop?: string[] } = {}): CompilerGraph {
  const concepts: C[] = [];
  const relationships: R[] = [];
  for (const t of ["demo-alpha", "demo-beta"]) {
    concepts.push(
      { key: `${t}.tradition.identity`, type: "tradition", category: "tradition_identity", tradition: t },
      { key: `${t}.material.dye`, type: "material", category: "materials", tradition: t },
      { key: `${t}.tool.block`, type: "tool", category: "tools", tradition: t },
      { key: `${t}.process_stage.wash`, type: "process_stage", category: "process_stages", tradition: t },
      { key: `${t}.process_stage.print`, type: "process_stage", category: "process_stages", tradition: t },
      { key: `${t}.process_stage.dye`, type: "process_stage", category: "process_stages", tradition: t },
      { key: `${t}.outcome.colour`, type: "outcome", category: "production_outcomes", tradition: t },
      { key: `${t}.scientific_mechanism.bond`, type: "scientific_mechanism", category: "scientific_mechanisms", tradition: t },
    );
    relationships.push(
      { source: `${t}.process_stage.wash`, target: `${t}.process_stage.print`, type: "PRECEDES", ordinal: 1 },
      { source: `${t}.process_stage.print`, target: `${t}.process_stage.dye`, type: "PRECEDES", ordinal: 2 },
      { source: `${t}.process_stage.print`, target: `${t}.tool.block`, type: "USES" },
      { source: `${t}.process_stage.dye`, target: `${t}.material.dye`, type: "USES" },
      { source: `${t}.process_stage.dye`, target: `${t}.outcome.colour`, type: "CAUSES" },
      { source: `${t}.process_stage.dye`, target: `${t}.process_stage.wash`, type: "DEPENDS_ON" },
      { source: `${t}.outcome.colour`, target: `${t}.scientific_mechanism.bond`, type: "SCIENTIFICALLY_EXPLAINED_BY" },
      { source: `${t}.material.dye`, target: `${t}.tradition.identity`, type: "BELONGS_TO" },
    );
  }
  concepts.push({ key: "demo-shared.scientific_mechanism.oxidation", type: "scientific_mechanism", category: "scientific_mechanisms", tradition: null });
  concepts.push({
    key: "demo-cmp.comparison.dyes",
    type: "comparison",
    category: "cross_tradition_comparisons",
    tradition: null,
    compares: ["demo-alpha.material.dye", "demo-beta.material.dye"],
  });
  relationships.push(
    { source: "demo-alpha.material.dye", target: "demo-beta.material.dye", type: "SIMILAR_TO" },
    { source: "demo-alpha.outcome.colour", target: "demo-shared.scientific_mechanism.oxidation", type: "SCIENTIFICALLY_EXPLAINED_BY" },
  );
  concepts.push(...(extra.concepts ?? []));
  relationships.push(...(extra.relationships ?? []));
  const drop = new Set(extra.drop ?? []);
  return {
    versionLabel: "demo-synthetic-1",
    categories: VOCAB.categories,
    relationshipTypes: VOCAB.relationshipTypes,
    traditions: ["demo-alpha", "demo-beta"].map((s) => ({ id: traditionUuid(s), slug: s, name: `Demo: ${s}` })),
    concepts: concepts
      .filter((c) => !drop.has(c.key))
      .map((c) => ({
        id: conceptUuid(c.key),
        key: c.key,
        type: c.type,
        category: c.category,
        traditionId: c.tradition ? traditionUuid(c.tradition) : null,
        title: `Demo: ${c.key.split(".").pop()}`,
        summary: "",
        compares: c.compares ?? [],
      })),
    relationships: relationships.map((r) => ({
      id: relationshipUuid(r),
      source: r.source,
      target: r.target,
      type: r.type,
      explanation: null,
      ordinal: r.ordinal ?? null,
    })),
  };
}

export function syntheticInput(graph = syntheticGraph(), overrides: Partial<CompileInput> = {}): CompileInput {
  return {
    graph,
    snapshotVersion: graph.versionLabel,
    traditions: ["demo-alpha", "demo-beta"],
    ruleSet: defaultRuleSet(),
    seed: "seed-a",
    ...overrides,
  };
}

export function checkOf(result: CompileResult, id: string) {
  const c = result.validation.checks.find((x) => x.id === id);
  if (!c) throw new Error(`No check ${id}`);
  return c;
}
