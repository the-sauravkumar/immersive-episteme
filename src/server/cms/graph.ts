/**
 * Knowledge-graph validation for the staff relationship editor, using the existing validator
 * (src/features/knowledge/graph validateGraph) over the database model
 * (src/server/content/review-snapshot.ts loadModelFromDb), with the relationship-type registry
 * read from `relationship_types`.
 */
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import type { GraphRelationship, IntegrityIssue } from "@/features/knowledge/graph/types";
import { relationshipId, sortIssues, validateGraph } from "@/features/knowledge/graph/validate";
import { loadModelFromDb } from "@/server/content/review-snapshot";

import type { Q } from "./core";
import { relationshipRegistry } from "./release";

export interface GraphIntegrity {
  counts: { error: number; warning: number; info: number };
  issues: IntegrityIssue[];
}

/** Integrity issues of everything in the review pipeline (what the next release would contain). */
export async function graphIntegrity(q: Q, limit = 400): Promise<GraphIntegrity> {
  const registry = await relationshipRegistry(q);
  const { model } = await loadModelFromDb(q, nodeSha256);
  const issues = sortIssues(validateGraph(model, { registry }));
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return { counts, issues: issues.filter((i) => i.severity !== "info").slice(0, limit) };
}

/**
 * Issues the given relationship would raise if it entered the review pipeline (e.g. on submit):
 * the edge is added to the pipeline model as `under_review` and validated with everything else;
 * only issues attributed to this edge (entity = "source|TYPE|target") are returned.
 */
export async function edgeIssues(q: Q, id: string): Promise<IntegrityIssue[]> {
  const r = await q.query<{
    source_key: string; target_key: string; type_code: string; explanation: string | null; conditions: string | null; ordinal: number | null; strength: number | null;
    provenance_kind: GraphRelationship["provenanceKind"]; package_slug: string | null; source_refs: string[] | null;
  }>(
    `SELECT s.key AS source_key, t.key AS target_key, r.type_code, r.explanation, r.conditions, r.ordinal, r.strength, r.provenance_kind, p.slug AS package_slug,
            array_agg(coalesce(sp.slug, 'cms') || '#' || coalesce(so.local_key, so.id::text)) FILTER (WHERE so.id IS NOT NULL) AS source_refs
       FROM relationships r JOIN concepts s ON s.id = r.source_concept_id JOIN concepts t ON t.id = r.target_concept_id
       LEFT JOIN content_packages p ON p.id = r.package_id
       LEFT JOIN relationship_sources rs ON rs.relationship_id = r.id LEFT JOIN sources so ON so.id = rs.source_id LEFT JOIN content_packages sp ON sp.id = so.package_id
      WHERE r.id = $1 GROUP BY r.id, s.key, t.key, p.slug`,
    [id],
  );
  const row = r.rows[0];
  if (!row) return [];
  const registry = await relationshipRegistry(q);
  const { model } = await loadModelFromDb(q, nodeSha256);
  const keys = new Set(model.concepts.map((c) => c.key));
  const rel: GraphRelationship = {
    packageSlug: row.package_slug ?? "cms",
    index: model.relationships.length,
    source: row.source_key,
    target: row.target_key,
    type: row.type_code,
    explanation: row.explanation,
    conditions: row.conditions,
    ordinal: row.ordinal,
    strength: row.strength,
    provenanceKind: row.provenance_kind,
    verificationState: "under_review",
    sourceRefs: row.source_refs ?? [],
    rawSourceIds: row.source_refs ?? [],
  };
  const out: IntegrityIssue[] = [];
  for (const k of [rel.source, rel.target]) {
    if (!keys.has(k)) out.push({ code: "CMS201", severity: "warning", message: `${k} is not in the review pipeline yet (draft, rejected or archived); the edge is validated once both ends are submitted`, entity: relationshipId(rel) });
  }
  const others = model.relationships.filter((x) => relationshipId(x) !== relationshipId(rel));
  const issues = validateGraph({ ...model, relationships: [...others, rel] }, { registry });
  const own = relationshipId(rel);
  return [...out, ...sortIssues(issues.filter((i) => i.entity === own))];
}
