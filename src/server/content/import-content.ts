/**
 * Content importer: content/ interchange files (FORMAT.md v1) -> knowledge tables.
 *
 * Run through `npm run content:import` (scripts/content/import.ts) or `npm run dev:bootstrap`.
 * Not `server-only`: the tsx scripts and the integration tests call it with a plain pg client.
 *
 * Guarantees
 *  - Read-only on content/. The files are validated with the knowledge-graph loader and
 *    validators first; any error-level integrity issue aborts the import (nothing is written).
 *  - Idempotent. New rows get name-based ids derived from their keys (the same
 *    `contentIds()` the snapshot builder uses), rows are upserted on their natural keys
 *    (package slug, tradition slug, concept key, (package, local source id), (concept,
 *    claim position), (source, target, type)), and an update only happens when a column
 *    actually differs. A second import of unchanged files writes nothing but the audit entry.
 *  - Review states are copied exactly from the files (`under_review` / `needs_evidence`;
 *    sources, which carry no state in FORMAT v1, are `under_review`). The importer never sets
 *    `verified` or `published`, and it never touches a row a curator has already accepted
 *    (verified/published): such rows, and their claims and evidence, are reported as
 *    `keptAccepted` and left as they are.
 *  - `is_demo = false` everywhere (real content; demo rows are a separate seed).
 *  - Content removed from a file is pruned for the packages being imported: claims beyond the
 *    file's claim count, claim and relationship evidence links no longer cited, relationships
 *    and media candidates no longer listed. Concepts, sources and traditions that disappeared
 *    from the files are reported (`stale`), never deleted, because studies, telemetry and
 *    assessments may reference them.
 *  - One transaction, plus one append-only `audit_log` row (actor_kind 'system').
 */
import type { PoolClient } from "pg";

import { contentIds, type ContentIds } from "@/features/knowledge/graph/snapshot";
import { nameBasedUuid, type Sha256Hasher } from "@/features/knowledge/graph/hash";
import { relationshipId } from "@/features/knowledge/graph/validate";
import type { GraphPackage, IntegrityIssue, KnowledgeGraphModel } from "@/features/knowledge/graph/types";
import { slugFromConceptKey } from "@/features/knowledge/contracts";

type Q = Pick<PoolClient, "query">;

export interface ImportInput {
  model: KnowledgeGraphModel;
  issues: readonly IntegrityIssue[];
  hasher: Sha256Hasher;
  /** Free text recorded in the audit log (e.g. "npm run content:import"). */
  invokedBy?: string;
}

export interface TableCounts {
  inserted: number;
  updated: number;
  unchanged: number;
  keptAccepted: number;
}

export interface ImportSummary {
  packages: TableCounts;
  traditions: TableCounts;
  sources: TableCounts;
  concepts: TableCounts;
  claims: TableCounts;
  relationships: TableCounts;
  claimSources: { inserted: number; pruned: number };
  relationshipSources: { inserted: number; pruned: number };
  traditionSources: { inserted: number; pruned: number };
  mediaCandidates: TableCounts & { pruned: number };
  pruned: { claims: number; relationships: number };
  stale: { concepts: string[]; sources: string[]; traditions: string[] };
  files: { path: string; slug: string; sha256: string | null }[];
  auditLogId: string;
}

export class ContentImportRefused extends Error {
  constructor(
    message: string,
    readonly issues: readonly IntegrityIssue[],
  ) {
    super(message);
    this.name = "ContentImportRefused";
  }
}

const ACCEPTED = ["verified", "published"];
const zero = (): TableCounts => ({ inserted: 0, updated: 0, unchanged: 0, keptAccepted: 0 });

/**
 * Upsert helper. `rows` are inserted through jsonb_to_recordset; on a conflict on `conflict`
 * the `update` columns are overwritten only when they differ and (when `guardAccepted`) the
 * existing row is not accepted. Returns per-row outcome via `xmax`.
 */
async function upsert(
  q: Q,
  opts: {
    table: string;
    columns: readonly [string, string][]; // [name, sql type]
    conflict: string;
    update: readonly string[];
    guardAccepted?: boolean;
    rows: readonly Record<string, unknown>[];
    returning?: string;
  },
): Promise<{ counts: TableCounts; rows: Record<string, unknown>[] }> {
  const counts = zero();
  if (opts.rows.length === 0) return { counts, rows: [] };
  const cols = opts.columns.map(([n]) => n);
  const recordDef = opts.columns.map(([n, t]) => `"${n}" ${t}`).join(", ");
  const setList = opts.update.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
  const differs = `(${opts.update.map((c) => `t."${c}"`).join(", ")}) IS DISTINCT FROM (${opts.update.map((c) => `EXCLUDED."${c}"`).join(", ")})`;
  const guard = opts.guardAccepted ? ` AND t.verification_state NOT IN ('verified', 'published')` : "";
  const sql = `
    WITH input AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(${recordDef}))
    INSERT INTO ${opts.table} AS t (${cols.map((c) => `"${c}"`).join(", ")})
    SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM input
    ON CONFLICT ${opts.conflict} DO UPDATE SET ${setList}
      WHERE ${differs}${guard}
    RETURNING (xmax = 0) AS inserted${opts.returning ? `, ${opts.returning}` : ""}`;
  const res = await q.query<Record<string, unknown>>(sql, [JSON.stringify(opts.rows)]);
  for (const r of res.rows) {
    if (r.inserted) counts.inserted++;
    else counts.updated++;
  }
  return { counts, rows: res.rows };
}

function packageKindOf(p: GraphPackage): string {
  return p.kind;
}

/** Validates, then imports `model` in one transaction on `client`. */
export async function importContent(client: PoolClient, input: ImportInput): Promise<ImportSummary> {
  const errors = input.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    throw new ContentImportRefused(
      `content/ has ${errors.length} error-level integrity issue(s) (${[...new Set(errors.map((e) => e.code))].sort().join(", ")}); nothing was imported`,
      errors,
    );
  }
  const { model, hasher } = input;
  if (model.packages.some((p) => p.isDemo) || model.concepts.some((c) => c.isDemo)) {
    throw new ContentImportRefused("Demo content cannot be imported as real content", []);
  }
  const ids: ContentIds = contentIds(hasher);
  const pkgUuid = (slug: string) => nameBasedUuid(hasher, "package", slug);

  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.change_reason', $1, true)", ["content import (content/ interchange files)"]);
    const summary = await importInTransaction(client, model, ids, pkgUuid, hasher, input.invokedBy ?? "content importer");
    await client.query("COMMIT");
    return summary;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function importInTransaction(
  q: Q,
  model: KnowledgeGraphModel,
  ids: ContentIds,
  pkgUuid: (slug: string) => string,
  hasher: Sha256Hasher,
  invokedBy: string,
): Promise<ImportSummary> {
  // ---- packages ---------------------------------------------------------------------------
  const pkgRes = await upsert(q, {
    table: "content_packages",
    columns: [
      ["id", "uuid"],
      ["slug", "text"],
      ["kind", "text"],
      ["format_version", "integer"],
      ["name", "text"],
      ["alt_names", "text[]"],
      ["summary", "text"],
      ["source_path", "text"],
      ["file_sha256", "text"],
      ["imported_at", "timestamptz"],
      ["is_demo", "boolean"],
    ],
    conflict: "(slug)",
    update: ["kind", "format_version", "name", "alt_names", "summary", "source_path", "file_sha256"],
    rows: model.packages.map((p) => ({
      id: pkgUuid(p.slug),
      slug: p.slug,
      kind: packageKindOf(p),
      format_version: 1,
      name: p.name,
      alt_names: p.altNames,
      summary: p.summary,
      source_path: p.path,
      file_sha256: p.fileSha256,
      imported_at: new Date().toISOString(),
      is_demo: false,
    })),
  });
  const pkgRows = await q.query<{ id: string; slug: string }>("SELECT id, slug FROM content_packages WHERE slug = ANY($1::text[])", [
    model.packages.map((p) => p.slug),
  ]);
  const pkgId = new Map(pkgRows.rows.map((r) => [r.slug, r.id]));
  // Record the import time on every package touched by this run (imported_at is bookkeeping).
  await q.query("UPDATE content_packages SET imported_at = now() WHERE id = ANY($1::uuid[])", [[...pkgId.values()]]);
  const packages = pkgRes.counts;
  packages.unchanged = model.packages.length - packages.inserted - packages.updated;

  // ---- traditions -------------------------------------------------------------------------
  const traditionPackages = model.packages.filter((p) => p.kind === "tradition");
  const traditionState = (slug: string) => model.concepts.find((c) => c.packageSlug === slug && c.type === "tradition")?.verificationState ?? "under_review";
  const tradRes = await upsert(q, {
    table: "traditions",
    columns: [
      ["id", "uuid"],
      ["package_id", "uuid"],
      ["slug", "text"],
      ["name", "text"],
      ["alt_names", "text[]"],
      ["summary", "text"],
      ["region_place", "text"],
      ["region_district", "text"],
      ["region_state", "text"],
      ["region_country", "text"],
      ["latitude", "double precision"],
      ["longitude", "double precision"],
      ["gi_registered", "boolean"],
      ["gi_application_no", "text"],
      ["gi_year", "integer"],
      ["verification_state", "verification_state"],
      ["is_demo", "boolean"],
    ],
    conflict: "(slug)",
    update: [
      "package_id",
      "name",
      "alt_names",
      "summary",
      "region_place",
      "region_district",
      "region_state",
      "region_country",
      "latitude",
      "longitude",
      "gi_registered",
      "gi_application_no",
      "gi_year",
      "verification_state",
    ],
    guardAccepted: true,
    rows: traditionPackages.map((p) => ({
      id: ids.tradition(p.slug),
      package_id: pkgId.get(p.slug),
      slug: p.slug,
      name: p.name,
      alt_names: p.altNames,
      summary: p.summary,
      region_place: p.region?.place ?? null,
      region_district: p.region?.district ?? null,
      region_state: p.region?.state ?? null,
      region_country: p.region?.country ?? null,
      latitude: p.region?.lat ?? null,
      longitude: p.region?.lon ?? null,
      gi_registered: p.gi?.registered ?? null,
      gi_application_no: p.gi?.applicationNo ?? null,
      gi_year: p.gi?.year ?? null,
      verification_state: traditionState(p.slug),
      is_demo: false,
    })),
  });
  const tradRows = await q.query<{ id: string; slug: string; verification_state: string }>(
    "SELECT id, slug, verification_state FROM traditions WHERE NOT is_demo",
  );
  const traditionId = new Map(tradRows.rows.map((r) => [r.slug, r.id]));
  const traditions = tradRes.counts;
  traditions.keptAccepted = tradRows.rows.filter((r) => traditionPackages.some((p) => p.slug === r.slug) && ACCEPTED.includes(r.verification_state)).length;
  traditions.unchanged = traditionPackages.length - traditions.inserted - traditions.updated - traditions.keptAccepted;

  // ---- sources ----------------------------------------------------------------------------
  const srcRes = await upsert(q, {
    table: "sources",
    columns: [
      ["id", "uuid"],
      ["package_id", "uuid"],
      ["local_key", "text"],
      ["kind", "provenance_kind"],
      ["title", "text"],
      ["author", "text"],
      ["publisher", "text"],
      ["year", "integer"],
      ["url", "text"],
      ["accessed_on", "date"],
      ["reliability", "source_reliability"],
      ["notes", "text"],
      ["verification_state", "verification_state"],
      ["is_demo", "boolean"],
    ],
    conflict: "(package_id, local_key)",
    update: ["kind", "title", "author", "publisher", "year", "url", "accessed_on", "reliability", "notes", "verification_state"],
    guardAccepted: true,
    rows: model.sources.map((s) => ({
      id: ids.source(s.ref),
      package_id: pkgId.get(s.packageSlug),
      local_key: s.localId,
      kind: s.kind,
      title: s.title,
      author: s.author,
      publisher: s.publisher,
      year: s.year,
      url: s.url,
      accessed_on: s.accessed,
      reliability: s.reliability,
      notes: s.notes,
      verification_state: s.verificationState,
      is_demo: false,
    })),
  });
  const srcRows = await q.query<{ id: string; slug: string; local_key: string; verification_state: string }>(
    `SELECT s.id, p.slug, s.local_key, s.verification_state FROM sources s JOIN content_packages p ON p.id = s.package_id
      WHERE NOT s.is_demo AND s.local_key IS NOT NULL`,
  );
  const sourceId = new Map(srcRows.rows.map((r) => [`${r.slug}#${r.local_key}`, r.id]));
  const sources = srcRes.counts;
  const importedRefs = new Set(model.sources.map((s) => s.ref));
  sources.keptAccepted = srcRows.rows.filter((r) => importedRefs.has(`${r.slug}#${r.local_key}`) && ACCEPTED.includes(r.verification_state)).length;
  sources.unchanged = model.sources.length - sources.inserted - sources.updated - sources.keptAccepted;

  // ---- concepts ---------------------------------------------------------------------------
  const conRes = await upsert(q, {
    table: "concepts",
    columns: [
      ["id", "uuid"],
      ["key", "text"],
      ["slug", "text"],
      ["type", "concept_type"],
      ["category_code", "text"],
      ["tradition_id", "uuid"],
      ["package_id", "uuid"],
      ["title", "text"],
      ["summary", "text"],
      ["body_md", "text"],
      ["local_terms", "text[]"],
      ["compares", "text[]"],
      ["provenance_kind", "provenance_kind"],
      ["verification_state", "verification_state"],
      ["is_demo", "boolean"],
    ],
    conflict: "(key)",
    update: ["slug", "type", "category_code", "tradition_id", "package_id", "title", "summary", "body_md", "local_terms", "compares", "provenance_kind", "verification_state"],
    guardAccepted: true,
    rows: model.concepts.map((c) => ({
      id: ids.concept(c.key),
      key: c.key,
      slug: slugFromConceptKey(c.key),
      type: c.type,
      category_code: c.category,
      tradition_id: traditionId.get(c.packageSlug) ?? null,
      package_id: pkgId.get(c.packageSlug),
      title: c.title,
      summary: c.summary,
      body_md: c.bodyMd,
      local_terms: c.localTerms,
      compares: c.compares,
      provenance_kind: c.provenanceKind,
      verification_state: c.verificationState,
      is_demo: false,
    })),
  });
  const conRows = await q.query<{ id: string; key: string; verification_state: string; package_id: string | null }>(
    "SELECT id, key, verification_state, package_id FROM concepts WHERE NOT is_demo",
  );
  const conceptId = new Map(conRows.rows.map((r) => [r.key, r.id]));
  const acceptedConcepts = new Set(conRows.rows.filter((r) => ACCEPTED.includes(r.verification_state)).map((r) => r.key));
  const concepts = conRes.counts;
  const importedKeys = new Set(model.concepts.map((c) => c.key));
  concepts.keptAccepted = [...acceptedConcepts].filter((k) => importedKeys.has(k)).length;
  concepts.unchanged = model.concepts.length - concepts.inserted - concepts.updated - concepts.keptAccepted;

  // ---- claims (only for concepts that are not accepted) ------------------------------------
  const editable = model.concepts.filter((c) => !acceptedConcepts.has(c.key));
  const claimRows = editable.flatMap((c) =>
    c.claims.map((cl, i) => ({ id: ids.claim(c.key, i), concept_id: conceptId.get(c.key)!, position: i, text: cl.text, quote: cl.quote, is_demo: false })),
  );
  const claimRes = await upsert(q, {
    table: "concept_claims",
    columns: [
      ["id", "uuid"],
      ["concept_id", "uuid"],
      ["position", "smallint"],
      ["text", "text"],
      ["quote", "text"],
      ["is_demo", "boolean"],
    ],
    conflict: "(concept_id, position)",
    update: ["text", "quote"],
    rows: claimRows,
  });
  const claims = claimRes.counts;
  claims.unchanged = claimRows.length - claims.inserted - claims.updated;
  claims.keptAccepted = model.concepts.filter((c) => acceptedConcepts.has(c.key)).reduce((n, c) => n + c.claims.length, 0);

  const editableIds = editable.map((c) => conceptId.get(c.key)!);
  const prunedClaims = await q.query(
    `DELETE FROM concept_claims cc USING jsonb_to_recordset($1::jsonb) AS x(concept_id uuid, n integer)
      WHERE cc.concept_id = x.concept_id AND cc.position >= x.n`,
    [JSON.stringify(editable.map((c) => ({ concept_id: conceptId.get(c.key)!, n: c.claims.length })))],
  );
  const claimIdRows = await q.query<{ id: string; concept_id: string; position: number }>(
    "SELECT id, concept_id, position FROM concept_claims WHERE concept_id = ANY($1::uuid[])",
    [editableIds],
  );
  const claimId = new Map(claimIdRows.rows.map((r) => [`${r.concept_id}#${r.position}`, r.id]));
  const wantedClaimSources = editable.flatMap((c) =>
    c.claims.flatMap((cl, i) =>
      [...new Set(cl.sourceRefs)].map((ref) => ({
        claim_id: claimId.get(`${conceptId.get(c.key)!}#${i}`)!,
        source_id: sourceId.get(ref)!,
      })),
    ),
  );
  const prunedClaimSources = await q.query(
    `DELETE FROM concept_claim_sources cs
      WHERE cs.claim_id = ANY($1::uuid[])
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(claim_id uuid, source_id uuid)
                         WHERE x.claim_id = cs.claim_id AND x.source_id = cs.source_id)`,
    [[...claimId.values()], JSON.stringify(wantedClaimSources)],
  );
  const insClaimSources = await q.query(
    `INSERT INTO concept_claim_sources (claim_id, source_id, is_demo)
     SELECT claim_id, source_id, false FROM jsonb_to_recordset($1::jsonb) AS x(claim_id uuid, source_id uuid)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(wantedClaimSources)],
  );

  // ---- tradition sources (GI evidence) -----------------------------------------------------
  const wantedTradSources = traditionPackages.flatMap((p) =>
    [...new Set(p.gi?.sourceRefs ?? [])].map((ref) => ({ tradition_id: traditionId.get(p.slug)!, source_id: sourceId.get(ref)! })),
  );
  const importedTraditionIds = traditionPackages.map((p) => traditionId.get(p.slug)!);
  const prunedTradSources = await q.query(
    `DELETE FROM tradition_sources ts
      WHERE ts.tradition_id = ANY($1::uuid[]) AND ts.purpose = 'gi'
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(tradition_id uuid, source_id uuid)
                         WHERE x.tradition_id = ts.tradition_id AND x.source_id = ts.source_id)`,
    [importedTraditionIds, JSON.stringify(wantedTradSources)],
  );
  const insTradSources = await q.query(
    `INSERT INTO tradition_sources (tradition_id, source_id, purpose, is_demo)
     SELECT tradition_id, source_id, 'gi', false FROM jsonb_to_recordset($1::jsonb) AS x(tradition_id uuid, source_id uuid)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(wantedTradSources)],
  );

  // ---- relationships ----------------------------------------------------------------------
  const relInput = model.relationships.map((r) => ({
    id: ids.relationship(relationshipId(r)),
    source_concept_id: conceptId.get(r.source)!,
    target_concept_id: conceptId.get(r.target)!,
    type_code: r.type,
    package_id: pkgId.get(r.packageSlug),
    explanation: r.explanation,
    conditions: r.conditions,
    strength: r.strength,
    ordinal: r.ordinal,
    provenance_kind: r.provenanceKind,
    verification_state: r.verificationState,
    is_demo: false,
  }));
  // Prune relationships of the imported packages that the files no longer list (before the
  // upsert, so a re-typed or re-directed edge never trips the undirected/acyclic rules).
  const importedPkgIds = model.packages.map((p) => pkgId.get(p.slug)!);
  const prunedRels = await q.query(
    `DELETE FROM relationships r
      WHERE r.package_id = ANY($1::uuid[]) AND NOT r.is_demo
        AND r.verification_state NOT IN ('verified', 'published')
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(source_concept_id uuid, target_concept_id uuid, type_code text)
                         WHERE x.source_concept_id = r.source_concept_id AND x.target_concept_id = r.target_concept_id AND x.type_code = r.type_code)`,
    [importedPkgIds, JSON.stringify(relInput.map(({ source_concept_id, target_concept_id, type_code }) => ({ source_concept_id, target_concept_id, type_code })))],
  );
  const relRes = await upsert(q, {
    table: "relationships",
    columns: [
      ["id", "uuid"],
      ["source_concept_id", "uuid"],
      ["target_concept_id", "uuid"],
      ["type_code", "text"],
      ["package_id", "uuid"],
      ["explanation", "text"],
      ["conditions", "text"],
      ["strength", "double precision"],
      ["ordinal", "integer"],
      ["provenance_kind", "provenance_kind"],
      ["verification_state", "verification_state"],
      ["is_demo", "boolean"],
    ],
    conflict: "(source_concept_id, target_concept_id, type_code)",
    update: ["package_id", "explanation", "conditions", "strength", "ordinal", "provenance_kind", "verification_state"],
    guardAccepted: true,
    rows: relInput,
  });
  const relRows = await q.query<{ id: string; source_concept_id: string; target_concept_id: string; type_code: string; verification_state: string }>(
    "SELECT id, source_concept_id, target_concept_id, type_code, verification_state FROM relationships WHERE NOT is_demo",
  );
  const relKey = (s: string, t: string, ty: string) => `${s}|${ty}|${t}`;
  const relId = new Map(relRows.rows.map((r) => [relKey(r.source_concept_id, r.target_concept_id, r.type_code), r.id]));
  const acceptedRels = new Set(relRows.rows.filter((r) => ACCEPTED.includes(r.verification_state)).map((r) => r.id));
  const relationships = relRes.counts;
  const importedRelIds = relInput.map((r) => relId.get(relKey(r.source_concept_id, r.target_concept_id, r.type_code))!);
  relationships.keptAccepted = importedRelIds.filter((id) => acceptedRels.has(id)).length;
  relationships.unchanged = relInput.length - relationships.inserted - relationships.updated - relationships.keptAccepted;

  const editableRels = model.relationships
    .map((r, i) => ({ r, id: importedRelIds[i]! }))
    .filter(({ id }) => !acceptedRels.has(id));
  const wantedRelSources = editableRels.flatMap(({ r, id }) => [...new Set(r.sourceRefs)].map((ref) => ({ relationship_id: id, source_id: sourceId.get(ref)! })));
  const prunedRelSources = await q.query(
    `DELETE FROM relationship_sources rs
      WHERE rs.relationship_id = ANY($1::uuid[])
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(relationship_id uuid, source_id uuid)
                         WHERE x.relationship_id = rs.relationship_id AND x.source_id = rs.source_id)`,
    [editableRels.map((e) => e.id), JSON.stringify(wantedRelSources)],
  );
  const insRelSources = await q.query(
    `INSERT INTO relationship_sources (relationship_id, source_id, is_demo)
     SELECT relationship_id, source_id, false FROM jsonb_to_recordset($1::jsonb) AS x(relationship_id uuid, source_id uuid)
     ON CONFLICT DO NOTHING`,
    [JSON.stringify(wantedRelSources)],
  );

  // ---- media candidates -------------------------------------------------------------------
  const mediaInput = model.packages.flatMap((p) =>
    p.mediaCandidates.map((m) => ({
      id: nameBasedUuid(hasher, "media-candidate", p.slug, m.url, m.depicts ?? ""),
      package_id: pkgId.get(p.slug)!,
      url: m.url,
      title: m.title,
      licence: m.licence,
      author: m.author,
      depicts_key: m.depicts,
      depicts_concept_id: m.depicts ? (conceptId.get(m.depicts) ?? null) : null,
      width: m.width,
      height: m.height,
      mime_type: m.mime,
      dimensions_source: m.dimensionsSource,
      is_demo: false,
    })),
  );
  const prunedMedia = await q.query(
    `DELETE FROM media_candidates mc
      WHERE mc.package_id = ANY($1::uuid[]) AND mc.status = 'candidate'
        AND NOT EXISTS (SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS x(package_id uuid, url text, depicts_key text)
                         WHERE x.package_id = mc.package_id AND x.url = mc.url AND x.depicts_key IS NOT DISTINCT FROM mc.depicts_key)`,
    [importedPkgIds, JSON.stringify(mediaInput.map(({ package_id, url, depicts_key }) => ({ package_id, url, depicts_key })))],
  );
  const mediaRes = await upsert(q, {
    table: "media_candidates",
    columns: [
      ["id", "uuid"],
      ["package_id", "uuid"],
      ["url", "text"],
      ["title", "text"],
      ["licence", "text"],
      ["author", "text"],
      ["depicts_key", "text"],
      ["depicts_concept_id", "uuid"],
      ["width", "integer"],
      ["height", "integer"],
      ["mime_type", "text"],
      ["dimensions_source", "text"],
      ["is_demo", "boolean"],
    ],
    conflict: "(package_id, url, depicts_key)",
    update: ["title", "licence", "author", "depicts_concept_id", "width", "height", "mime_type", "dimensions_source"],
    rows: mediaInput,
  });
  const mediaCandidates = { ...mediaRes.counts, pruned: prunedMedia.rowCount ?? 0 };
  mediaCandidates.unchanged = mediaInput.length - mediaCandidates.inserted - mediaCandidates.updated;

  // ---- stale (reported, never deleted) ------------------------------------------------------
  const staleConcepts = conRows.rows.filter((r) => r.package_id && importedPkgIds.includes(r.package_id) && !importedKeys.has(r.key)).map((r) => r.key);
  const staleSources = srcRows.rows
    .filter((r) => model.packages.some((p) => p.slug === r.slug) && !importedRefs.has(`${r.slug}#${r.local_key}`))
    .map((r) => `${r.slug}#${r.local_key}`);
  const staleTraditions = tradRows.rows.filter((r) => !traditionPackages.some((p) => p.slug === r.slug)).map((r) => r.slug);

  const files = [...model.packages]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((p) => ({ path: p.path, slug: p.slug, sha256: p.fileSha256 }));

  const body = {
    packages,
    traditions,
    sources,
    concepts,
    claims,
    relationships,
    claimSources: { inserted: insClaimSources.rowCount ?? 0, pruned: prunedClaimSources.rowCount ?? 0 },
    relationshipSources: { inserted: insRelSources.rowCount ?? 0, pruned: prunedRelSources.rowCount ?? 0 },
    traditionSources: { inserted: insTradSources.rowCount ?? 0, pruned: prunedTradSources.rowCount ?? 0 },
    mediaCandidates,
    pruned: { claims: prunedClaims.rowCount ?? 0, relationships: prunedRels.rowCount ?? 0 },
    stale: { concepts: staleConcepts.sort(), sources: staleSources.sort(), traditions: staleTraditions.sort() },
    files,
  };
  const audit = await q.query<{ id: string }>(
    `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason)
     VALUES ('system', $1, 'content.import', 'content_packages', NULL, $2::jsonb, $3) RETURNING id`,
    ["content-importer", JSON.stringify(body), `content import from ${files.length} file(s) (${invokedBy})`],
  );
  return { ...body, auditLogId: audit.rows[0]!.id };
}
