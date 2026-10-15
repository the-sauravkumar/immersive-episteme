/**
 * Resolves the protocol-defined concept set and relationship vocabulary of a concept-map item.
 *
 * The item config names concepts by key (`conceptKeys`, in protocol order). Participants get
 * the labels from their session's pinned snapshot (the same knowledge bundle both conditions
 * read); staff authoring and scoring use the knowledge tables, whose ids are the snapshot ids.
 * Node keys are position-derived (c1, c2, ...) so the pre and post maps of a participant share
 * them.
 */
import { itemConfigSchema } from "@/features/research/contracts";
import type { MapConcept, MapRelationshipType } from "@/components/assessment/map-state";

import { AssessmentError, type Q } from "./common";

export type ConceptMapItemConfig = Extract<ReturnType<typeof itemConfigSchema.parse>, { kind: "concept_map" }>;

export interface ConceptSet {
  concepts: MapConcept[];
  /** concept id -> knowledge category code (cross-category measures). */
  categories: Record<string, string>;
  relationshipTypes: MapRelationshipType[];
  directedLinks: boolean;
  config: ConceptMapItemConfig;
}

export function parseConceptMapConfig(raw: unknown): ConceptMapItemConfig {
  const parsed = itemConfigSchema.safeParse(raw);
  if (!parsed.success || parsed.data.kind !== "concept_map") throw new AssessmentError("invalid", "The item is not a valid concept-map item.");
  return parsed.data;
}

function assemble(
  config: ConceptMapItemConfig,
  concepts: ReadonlyArray<{ id: string; key: string; title: string; category: string }>,
  types: ReadonlyArray<{ code: string; label: string; directed: boolean }>,
): ConceptSet {
  const byKey = new Map(concepts.map((c) => [c.key, c]));
  const missing = config.conceptKeys.filter((k) => !byKey.has(k));
  if (missing.length > 0) throw new AssessmentError("invalid", `Concepts not available: ${missing.join(", ")}`);
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const unknownTypes = config.relationshipTypes.filter((t) => !typeByCode.has(t));
  if (unknownTypes.length > 0) throw new AssessmentError("invalid", `Relationship types not available: ${unknownTypes.join(", ")}`);
  const set = config.conceptKeys.map((k, i) => {
    const c = byKey.get(k)!;
    return { nodeKey: `c${i + 1}`, conceptId: c.id, label: c.title, category: c.category };
  });
  return {
    concepts: set.map(({ nodeKey, conceptId, label }) => ({ nodeKey, conceptId, label })),
    categories: Object.fromEntries(set.map((c) => [c.conceptId, c.category])),
    relationshipTypes: config.relationshipTypes.map((code) => {
      const t = typeByCode.get(code)!;
      return { code, label: t.label, directed: t.directed };
    }),
    directedLinks: config.directed,
    config,
  };
}

/** From the knowledge tables (staff authoring, scoring, and sessions without a snapshot). */
export async function conceptSetFromTables(q: Q, rawConfig: unknown): Promise<ConceptSet> {
  const config = parseConceptMapConfig(rawConfig);
  const c = await q.query<{ id: string; key: string; title: string; category: string }>(
    "SELECT id, key, title, category_code AS category FROM concepts WHERE key = ANY($1::text[])",
    [config.conceptKeys],
  );
  const t = await q.query<{ code: string; label: string; directed: boolean }>(
    "SELECT code, label, directed FROM relationship_types WHERE code = ANY($1::text[])",
    [config.relationshipTypes],
  );
  return assemble(config, c.rows, t.rows);
}

/**
 * From a session's pinned snapshot (what the participant learned from). Reads only the concept
 * and relationship-type slices of the immutable payload; the snapshot must be readable
 * (published, or a review snapshot), as for the knowledge read model.
 */
export async function conceptSetFromSnapshot(q: Q, snapshotId: string, rawConfig: unknown): Promise<ConceptSet> {
  const config = parseConceptMapConfig(rawConfig);
  const readable = await q.query("SELECT 1 FROM content_snapshots WHERE id = $1 AND (status = 'published' OR kind = 'review')", [snapshotId]);
  if (!readable.rowCount) throw new AssessmentError("invalid", "The session's content snapshot is not readable.");
  const c = await q.query<{ id: string | null; key: string; title: string | null; category: string | null }>(
    `SELECT c->>'id' AS id, c->>'key' AS key, c->>'title' AS title, c->>'category' AS category
       FROM content_snapshots s, jsonb_array_elements(s.payload->'concepts') c
      WHERE s.id = $1 AND c->>'key' = ANY($2::text[])`,
    [snapshotId, config.conceptKeys],
  );
  const t = await q.query<{ code: string; label: string | null; directed: boolean | null }>(
    `SELECT t->>'code' AS code, t->>'label' AS label, (t->>'directed')::boolean AS directed
       FROM content_snapshots s, jsonb_array_elements(s.payload->'relationshipTypes') t
      WHERE s.id = $1 AND t->>'code' = ANY($2::text[])`,
    [snapshotId, config.relationshipTypes],
  );
  if (c.rows.some((r) => !r.id || !r.title || !r.category) || t.rows.some((r) => !r.label || r.directed === null)) {
    throw new AssessmentError("invalid", "The session's content snapshot lacks concept or relationship-type details.");
  }
  return assemble(
    config,
    c.rows.map((r) => ({ id: r.id!, key: r.key, title: r.title!, category: r.category! })),
    t.rows.map((r) => ({ code: r.code, label: r.label!, directed: r.directed! })),
  );
}
