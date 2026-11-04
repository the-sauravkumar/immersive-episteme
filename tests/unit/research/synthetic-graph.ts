import { KNOWLEDGE_CATEGORIES, RELATIONSHIP_TYPES } from "@db/seeds/reference-data";
import type { ConceptType } from "@/lib/validation/enums";
import { deterministicUuid } from "@/lib/canonical-hash";

const traditionUuid = (slug: string) => deterministicUuid("tradition", slug);
const conceptUuid = (key: string) => deterministicUuid("concept", key);
const relationshipUuid = (r: { source: string; target: string; type: string }) => deterministicUuid("relationship", `${r.source}|${r.type}|${r.target}`);

const VOCAB = {
  categories: KNOWLEDGE_CATEGORIES.map((c, i) => ({ code: c.code, label: c.label, templateGroup: c.templateGroup, position: i + 1 })),
  relationshipTypes: RELATIONSHIP_TYPES.map((t) => ({ code: t.code, label: t.label, semantics: t.semantics, directed: t.directed, ordered: t.ordered, allowsCycles: t.allowsCycles })),
};

type C = { key: string; type: ConceptType; category: (typeof KNOWLEDGE_CATEGORIES)[number]["code"]; tradition: string | null; compares?: string[] };
type R = { source: string; target: string; type: string; ordinal?: number | null };

export function syntheticGraph(extra: { concepts?: C[]; relationships?: R[]; drop?: string[] } = {}) {
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

