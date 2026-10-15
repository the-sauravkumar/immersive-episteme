/**
 * CMS read side (staff only). Reads the LIVE knowledge tables, which is correct for authoring;
 * learning pages never use this module (they read immutable snapshots through the read model).
 * Not `server-only` so tests can call it; pages call it after their permission gate.
 */
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import type { VerificationState } from "@/lib/validation/enums";
import { loadSnapshotPayload } from "@/server/knowledge/snapshot-store";

import { isUuid, type Q } from "./core";
import type { CmsEntityKind } from "./schemas";

export const PAGE_SIZE = 50;

export type StateCounts = Partial<Record<VerificationState, number>>;

export async function overviewCounts(q: Q): Promise<Record<"traditions" | "concepts" | "relationships" | "sources", StateCounts>> {
  const r = await q.query<{ kind: "traditions" | "concepts" | "relationships" | "sources"; state: VerificationState; n: number }>(
    `SELECT 'traditions' AS kind, verification_state AS state, count(*)::int AS n FROM traditions WHERE NOT is_demo GROUP BY 2
     UNION ALL SELECT 'concepts', verification_state, count(*)::int FROM concepts WHERE NOT is_demo GROUP BY 2
     UNION ALL SELECT 'relationships', verification_state, count(*)::int FROM relationships WHERE NOT is_demo GROUP BY 2
     UNION ALL SELECT 'sources', verification_state, count(*)::int FROM sources WHERE NOT is_demo GROUP BY 2`,
  );
  const out = { traditions: {}, concepts: {}, relationships: {}, sources: {} } as Record<"traditions" | "concepts" | "relationships" | "sources", StateCounts>;
  for (const row of r.rows) out[row.kind][row.state] = row.n;
  return out;
}

export interface TraditionRow {
  id: string;
  slug: string;
  name: string;
  altNames: string[];
  regionPlace: string | null;
  regionDistrict: string | null;
  regionState: string | null;
  regionCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  giRegistered: boolean | null;
  giApplicationNo: string | null;
  giYear: number | null;
  state: VerificationState;
  conceptCount: number;
  sources: { sourceId: string; purpose: string; title: string; localKey: string | null }[];
}

export async function listTraditions(q: Q): Promise<TraditionRow[]> {
  const r = await q.query(
    `SELECT t.id, t.slug, t.name, t.alt_names, t.region_place, t.region_district, t.region_state, t.region_country, t.latitude, t.longitude,
            t.gi_registered, t.gi_application_no, t.gi_year, t.verification_state,
            (SELECT count(*)::int FROM concepts c WHERE c.tradition_id = t.id) AS concept_count,
            coalesce((SELECT json_agg(json_build_object('sourceId', s.id, 'purpose', ts.purpose, 'title', s.title, 'localKey', s.local_key) ORDER BY ts.purpose, s.title)
                        FROM tradition_sources ts JOIN sources s ON s.id = ts.source_id WHERE ts.tradition_id = t.id), '[]') AS sources
       FROM traditions t WHERE NOT t.is_demo ORDER BY t.name`,
  );
  return r.rows.map((t) => ({
    id: t.id, slug: t.slug, name: t.name, altNames: t.alt_names, regionPlace: t.region_place, regionDistrict: t.region_district, regionState: t.region_state,
    regionCountry: t.region_country, latitude: t.latitude, longitude: t.longitude, giRegistered: t.gi_registered, giApplicationNo: t.gi_application_no,
    giYear: t.gi_year, state: t.verification_state, conceptCount: t.concept_count, sources: t.sources,
  }));
}

export async function listPackages(q: Q): Promise<{ slug: string; name: string; kind: string }[]> {
  const r = await q.query<{ slug: string; name: string; kind: string }>(
    "SELECT slug, name, kind FROM content_packages WHERE NOT is_demo AND kind <> 'cms' ORDER BY kind = 'tradition' DESC, name",
  );
  return r.rows;
}

export interface SourceRow {
  id: string;
  packageSlug: string | null;
  localKey: string | null;
  kind: string;
  title: string;
  author: string | null;
  publisher: string | null;
  year: number | null;
  url: string | null;
  accessedOn: string | null;
  reliability: string | null;
  citation: string | null;
  notes: string | null;
  state: VerificationState;
  citedBy: number;
}

export async function listSources(q: Q, f: { q?: string; state?: string; page?: number } = {}): Promise<{ rows: SourceRow[]; total: number }> {
  const where = ["NOT s.is_demo"];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${f.q}%`);
    where.push(`(s.title ILIKE $${params.length} OR s.author ILIKE $${params.length} OR s.publisher ILIKE $${params.length} OR s.local_key ILIKE $${params.length})`);
  }
  if (f.state) {
    params.push(f.state);
    where.push(`s.verification_state::text = $${params.length}`);
  }
  const page = Math.max(1, f.page ?? 1);
  const r = await q.query(
    `SELECT s.id, p.slug AS package_slug, s.local_key, s.kind, s.title, s.author, s.publisher, s.year, s.url, to_char(s.accessed_on, 'YYYY-MM-DD') AS accessed_on,
            s.reliability, s.citation, s.notes, s.verification_state,
            ((SELECT count(*) FROM concept_claim_sources cs WHERE cs.source_id = s.id) + (SELECT count(*) FROM relationship_sources rs WHERE rs.source_id = s.id))::int AS cited_by,
            count(*) OVER ()::int AS total
       FROM sources s LEFT JOIN content_packages p ON p.id = s.package_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.slug NULLS FIRST, s.title LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  return {
    total: r.rows[0]?.total ?? 0,
    rows: r.rows.map((s) => ({
      id: s.id, packageSlug: s.package_slug, localKey: s.local_key, kind: s.kind, title: s.title, author: s.author, publisher: s.publisher, year: s.year,
      url: s.url, accessedOn: s.accessed_on, reliability: s.reliability, citation: s.citation, notes: s.notes, state: s.verification_state, citedBy: s.cited_by,
    })),
  };
}

export async function getSource(q: Q, id: string): Promise<SourceRow | null> {
  if (!isUuid(id)) return null;
  const r = await q.query(
    `SELECT s.id, p.slug AS package_slug, s.local_key, s.kind, s.title, s.author, s.publisher, s.year, s.url, to_char(s.accessed_on, 'YYYY-MM-DD') AS accessed_on,
            s.reliability, s.citation, s.notes, s.verification_state, 0 AS cited_by
       FROM sources s LEFT JOIN content_packages p ON p.id = s.package_id WHERE s.id = $1 AND NOT s.is_demo`,
    [id],
  );
  const s = r.rows[0];
  return s
    ? { id: s.id, packageSlug: s.package_slug, localKey: s.local_key, kind: s.kind, title: s.title, author: s.author, publisher: s.publisher, year: s.year, url: s.url, accessedOn: s.accessed_on, reliability: s.reliability, citation: s.citation, notes: s.notes, state: s.verification_state, citedBy: 0 }
    : null;
}

export interface SourceOption {
  id: string;
  label: string;
  /** File-local id used in the generated body ("S1", "C3"). */
  key: string;
  state: VerificationState;
}

/** Every citable source (for claim / relationship forms). */
export async function sourceOptions(q: Q): Promise<SourceOption[]> {
  const r = await q.query<{ id: string; package_slug: string | null; local_key: string | null; title: string; author: string | null; year: number | null; verification_state: VerificationState }>(
    `SELECT s.id, p.slug AS package_slug, s.local_key, s.title, s.author, s.year, s.verification_state
       FROM sources s LEFT JOIN content_packages p ON p.id = s.package_id
      WHERE NOT s.is_demo AND s.verification_state NOT IN ('rejected', 'archived')
      ORDER BY p.slug NULLS FIRST, s.local_key, s.title`,
  );
  return r.rows.map((s) => ({
    id: s.id,
    key: s.local_key ?? s.id,
    label: `${s.package_slug ?? "cms"}#${s.local_key ?? "?"} · ${s.author ? `${s.author}${s.year ? ` ${s.year}` : ""}: ` : ""}${s.title.length > 90 ? `${s.title.slice(0, 89)}…` : s.title}`,
    state: s.verification_state,
  }));
}

export interface ConceptListRow {
  id: string;
  key: string;
  title: string;
  type: string;
  category: string;
  tradition: string | null;
  state: VerificationState;
  claims: number;
  incompleteClaims: number;
  updatedAt: string;
}

export async function listConcepts(
  q: Q,
  f: { tradition?: string; state?: string; type?: string; q?: string; page?: number } = {},
): Promise<{ rows: ConceptListRow[]; total: number }> {
  const where = ["NOT c.is_demo"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("$?", `$${params.length}`));
  };
  if (f.tradition) add("p.slug = $?", f.tradition);
  if (f.state) add("c.verification_state::text = $?", f.state);
  if (f.type) add("c.type::text = $?", f.type);
  if (f.q) add("(c.title ILIKE $? OR c.key ILIKE $?)", `%${f.q}%`);
  const page = Math.max(1, f.page ?? 1);
  const r = await q.query(
    `SELECT c.id, c.key, c.title, c.type, c.category_code, p.slug AS package_slug, c.verification_state, c.updated_at,
            (SELECT count(*)::int FROM concept_claims cc WHERE cc.concept_id = c.id) AS claims,
            (SELECT count(DISTINCT cc.id)::int FROM concept_claims cc LEFT JOIN concept_claim_sources cs ON cs.claim_id = cc.id
              WHERE cc.concept_id = c.id AND (cs.source_id IS NULL OR cs.locator IS NULL OR btrim(cs.locator) = '' OR ((cc.quote IS NULL OR btrim(cc.quote) = '') AND jsonb_array_length(cs.evidence) = 0))) AS incomplete,
            count(*) OVER ()::int AS total
       FROM concepts c LEFT JOIN content_packages p ON p.id = c.package_id
      WHERE ${where.join(" AND ")}
      ORDER BY c.key LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );
  return {
    total: r.rows[0]?.total ?? 0,
    rows: r.rows.map((c) => ({
      id: c.id, key: c.key, title: c.title, type: c.type, category: c.category_code, tradition: c.package_slug, state: c.verification_state,
      claims: c.claims, incompleteClaims: c.incomplete, updatedAt: (c.updated_at as Date).toISOString(),
    })),
  };
}

export interface ClaimDetail {
  id: string;
  position: number;
  text: string;
  quote: string | null;
  sources: { sourceId: string; locator: string | null; label: string; key: string; state: VerificationState }[];
}

export interface RelationshipRow {
  id: string;
  sourceId: string;
  sourceKey: string;
  sourceTitle: string;
  targetId: string;
  targetKey: string;
  targetTitle: string;
  typeCode: string;
  explanation: string | null;
  conditions: string | null;
  ordinal: number | null;
  strength: number | null;
  provenanceKind: string;
  state: VerificationState;
  sources: { sourceId: string; locator: string | null; quote: string | null; label: string }[];
}

export interface HistoryEntry {
  at: string;
  actor: string | null;
  what: string;
  reason: string | null;
  detail?: unknown;
}

export interface ConceptDetail {
  id: string;
  key: string;
  slug: string;
  type: string;
  category: string;
  packageSlug: string | null;
  traditionName: string | null;
  title: string;
  summary: string;
  bodyMd: string | null;
  notes: unknown;
  localTerms: string[];
  compares: string[];
  provenanceKind: string;
  state: VerificationState;
  isDemo: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  claims: ClaimDetail[];
  outgoing: RelationshipRow[];
  incoming: RelationshipRow[];
}

const sourceLabelSql = `coalesce(p.slug, 'cms') || '#' || coalesce(s.local_key, '?') || ' · ' || s.title`;

export async function getConcept(q: Q, id: string): Promise<ConceptDetail | null> {
  if (!isUuid(id)) return null;
  const r = await q.query(
    `SELECT c.*, p.slug AS package_slug, t.name AS tradition_name FROM concepts c
       LEFT JOIN content_packages p ON p.id = c.package_id LEFT JOIN traditions t ON t.id = c.tradition_id WHERE c.id = $1`,
    [id],
  );
  const c = r.rows[0];
  if (!c) return null;
  const cl = await q.query(
    `SELECT cc.id, cc.position, cc.text, cc.quote,
            coalesce(json_agg(json_build_object('sourceId', s.id, 'locator', cs.locator, 'label', ${sourceLabelSql}, 'key', coalesce(s.local_key, s.id::text), 'state', s.verification_state) ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL), '[]') AS sources
       FROM concept_claims cc LEFT JOIN concept_claim_sources cs ON cs.claim_id = cc.id LEFT JOIN sources s ON s.id = cs.source_id LEFT JOIN content_packages p ON p.id = s.package_id
      WHERE cc.concept_id = $1 GROUP BY cc.id ORDER BY cc.position`,
    [id],
  );
  const rels = await relationshipsWhere(q, "r.source_concept_id = $1 OR r.target_concept_id = $1", [id]);
  return {
    id: c.id, key: c.key, slug: c.slug, type: c.type, category: c.category_code, packageSlug: c.package_slug, traditionName: c.tradition_name,
    title: c.title, summary: c.summary, bodyMd: c.body_md, notes: c.body, localTerms: c.local_terms, compares: c.compares, provenanceKind: c.provenance_kind,
    state: c.verification_state, isDemo: c.is_demo, createdBy: c.created_by, updatedBy: c.updated_by,
    claims: cl.rows.map((x) => ({ id: x.id, position: x.position, text: x.text, quote: x.quote, sources: x.sources })),
    outgoing: rels.filter((x) => x.sourceId === id),
    incoming: rels.filter((x) => x.targetId === id),
  };
}

export async function relationshipsWhere(q: Q, where: string, params: unknown[]): Promise<RelationshipRow[]> {
  const r = await q.query(
    `SELECT r.id, r.source_concept_id, sc.key AS source_key, sc.title AS source_title, r.target_concept_id, tc.key AS target_key, tc.title AS target_title,
            r.type_code, r.explanation, r.conditions, r.ordinal, r.strength, r.provenance_kind, r.verification_state,
            coalesce((SELECT json_agg(json_build_object('sourceId', s.id, 'locator', rs.locator, 'quote', rs.quote, 'label', ${sourceLabelSql}) ORDER BY s.id)
                        FROM relationship_sources rs JOIN sources s ON s.id = rs.source_id LEFT JOIN content_packages p ON p.id = s.package_id
                       WHERE rs.relationship_id = r.id), '[]') AS sources
       FROM relationships r JOIN concepts sc ON sc.id = r.source_concept_id JOIN concepts tc ON tc.id = r.target_concept_id
      WHERE NOT r.is_demo AND (${where}) ORDER BY r.type_code, r.ordinal NULLS LAST, sc.key, tc.key`,
    params,
  );
  return r.rows.map((x) => ({
    id: x.id, sourceId: x.source_concept_id, sourceKey: x.source_key, sourceTitle: x.source_title, targetId: x.target_concept_id, targetKey: x.target_key,
    targetTitle: x.target_title, typeCode: x.type_code, explanation: x.explanation, conditions: x.conditions, ordinal: x.ordinal, strength: x.strength,
    provenanceKind: x.provenance_kind, state: x.verification_state, sources: x.sources,
  }));
}

const TABLE: Record<CmsEntityKind, string> = { tradition: "traditions", concept: "concepts", relationship: "relationships", source: "sources" };

/** Review history (verification_records) merged with CMS audit entries for one entity, newest first. */
export async function entityHistory(q: Q, kind: CmsEntityKind, id: string): Promise<HistoryEntry[]> {
  if (!isUuid(id)) return [];
  const r = await q.query<{ at: Date; actor: string | null; what: string; reason: string | null; detail: unknown }>(
    `SELECT v.created_at AS at, coalesce(u.name, v.actor_id) AS actor,
            'state ' || coalesce(v.from_state::text, '(new)') || ' → ' || v.to_state::text AS what, v.reason, NULL::jsonb AS detail
       FROM verification_records v LEFT JOIN users u ON u.id = v.actor_id
      WHERE v.entity_kind = $1::verifiable_entity_kind AND v.entity_id = $2
     UNION ALL
     SELECT a.occurred_at, coalesce(u.name, a.actor_id), a.action, a.reason, a.after
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.entity = $3 AND a.entity_id = $4
     ORDER BY 1 DESC LIMIT 200`,
    [kind, id, TABLE[kind], id],
  );
  return r.rows.map((x) => ({ at: x.at.toISOString(), actor: x.actor, what: x.what, reason: x.reason, detail: x.detail ?? undefined }));
}

export interface ReviewItem {
  kind: CmsEntityKind;
  id: string;
  label: string;
  sub: string | null;
  state: VerificationState;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Items awaiting a decision (under_review, needs_evidence by default). */
export async function reviewQueue(q: Q, f: { kind?: string; state?: string } = {}): Promise<ReviewItem[]> {
  const states = f.state ? [f.state] : ["under_review", "needs_evidence"];
  const parts: string[] = [];
  const want = (k: CmsEntityKind) => !f.kind || f.kind === k;
  if (want("tradition")) parts.push(`SELECT 'tradition' AS kind, id, name AS label, slug AS sub, verification_state, updated_at, created_by, updated_by FROM traditions WHERE NOT is_demo AND verification_state::text = ANY($1)`);
  if (want("concept")) parts.push(`SELECT 'concept', id, title, key, verification_state, updated_at, created_by, updated_by FROM concepts WHERE NOT is_demo AND verification_state::text = ANY($1)`);
  if (want("relationship")) parts.push(`SELECT 'relationship', r.id, s.title || ' ' || r.type_code || ' ' || t.title, s.key || '|' || r.type_code || '|' || t.key, r.verification_state, r.updated_at, r.created_by, r.updated_by
       FROM relationships r JOIN concepts s ON s.id = r.source_concept_id JOIN concepts t ON t.id = r.target_concept_id WHERE NOT r.is_demo AND r.verification_state::text = ANY($1)`);
  if (want("source")) parts.push(`SELECT 'source', id, title, local_key, verification_state, updated_at, created_by, updated_by FROM sources WHERE NOT is_demo AND verification_state::text = ANY($1)`);
  if (!parts.length) return [];
  const r = await q.query(`${parts.join(" UNION ALL ")} ORDER BY 6 DESC LIMIT 500`, [states]);
  return r.rows.map((x) => ({
    kind: x.kind, id: x.id, label: x.label, sub: x.sub, state: x.verification_state, updatedAt: (x.updated_at as Date).toISOString(), createdBy: x.created_by, updatedBy: x.updated_by,
  }));
}

export interface RelationshipTypeRow {
  code: string;
  label: string;
  inverseLabel: string | null;
  description: string;
  semantics: string;
  directed: boolean;
  ordered: boolean;
  allowsCycles: boolean;
  requiresEvidence: boolean;
}

export async function relationshipTypes(q: Q): Promise<RelationshipTypeRow[]> {
  const r = await q.query(
    "SELECT code, label, inverse_label, description, semantics, directed, ordered, allows_cycles, requires_evidence FROM relationship_types ORDER BY semantics, code",
  );
  return r.rows.map((t) => ({
    code: t.code, label: t.label, inverseLabel: t.inverse_label, description: t.description, semantics: t.semantics, directed: t.directed,
    ordered: t.ordered, allowsCycles: t.allows_cycles, requiresEvidence: t.requires_evidence,
  }));
}

export interface ConceptOption {
  id: string;
  key: string;
  title: string;
  type: string;
  tradition: string | null;
  state: VerificationState;
}

export async function conceptOptions(q: Q): Promise<ConceptOption[]> {
  const r = await q.query(
    `SELECT c.id, c.key, c.title, c.type, p.slug AS package_slug, c.verification_state FROM concepts c LEFT JOIN content_packages p ON p.id = c.package_id
      WHERE NOT c.is_demo AND c.verification_state NOT IN ('rejected', 'archived') ORDER BY c.key`,
  );
  return r.rows.map((c) => ({ id: c.id, key: c.key, title: c.title, type: c.type, tradition: c.package_slug, state: c.verification_state }));
}

export interface SnapshotRowView {
  id: string;
  versionLabel: string;
  title: string;
  kind: "release" | "review";
  status: "draft" | "published";
  includesUnverified: boolean;
  itemCount: number;
  payloadSha256: string;
  createdAt: string;
  createdBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  manifests: number;
  studies: number;
}

export async function listSnapshots(q: Q): Promise<SnapshotRowView[]> {
  const r = await q.query(
    `SELECT s.id, s.version_label, s.title, s.kind, s.status, s.includes_unverified, s.payload_sha256, s.created_at, s.published_at,
            cu.name AS created_by, pu.name AS published_by,
            (SELECT count(*)::int FROM snapshot_items i WHERE i.snapshot_id = s.id) AS items,
            (SELECT count(*)::int FROM spatial_manifests m WHERE m.snapshot_id = s.id) AS manifests,
            (SELECT count(*)::int FROM studies st WHERE st.snapshot_id = s.id) AS studies
       FROM content_snapshots s LEFT JOIN users cu ON cu.id = s.created_by LEFT JOIN users pu ON pu.id = s.published_by
      WHERE NOT s.is_demo ORDER BY s.created_at DESC LIMIT 200`,
  );
  return r.rows.map((s) => ({
    id: s.id, versionLabel: s.version_label, title: s.title, kind: s.kind, status: s.status, includesUnverified: s.includes_unverified,
    itemCount: s.items, payloadSha256: s.payload_sha256, createdAt: (s.created_at as Date).toISOString(), createdBy: s.created_by,
    publishedAt: s.published_at ? (s.published_at as Date).toISOString() : null, publishedBy: s.published_by, manifests: s.manifests, studies: s.studies,
  }));
}

export async function snapshotBundle(q: Q, id: string): Promise<KnowledgeBundle | null> {
  if (!isUuid(id)) return null;
  try {
    return await loadSnapshotPayload(q, id);
  } catch {
    return null;
  }
}

export interface GraphNode {
  id: string;
  key: string;
  title: string;
  type: string;
  tradition: string | null;
  state: VerificationState;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  ordinal: number | null;
  state: VerificationState;
}

/** Live graph for the staff relationship editor (no rejected/archived concepts, no demo rows). */
export async function graphData(q: Q): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const n = await q.query(
    `SELECT c.id, c.key, c.title, c.type, p.slug AS package_slug, c.verification_state FROM concepts c LEFT JOIN content_packages p ON p.id = c.package_id
      WHERE NOT c.is_demo AND c.verification_state NOT IN ('rejected', 'archived') ORDER BY c.key`,
  );
  const e = await q.query(
    `SELECT r.id, r.source_concept_id, r.target_concept_id, r.type_code, r.ordinal, r.verification_state FROM relationships r
       JOIN concepts s ON s.id = r.source_concept_id JOIN concepts t ON t.id = r.target_concept_id
      WHERE NOT r.is_demo AND s.verification_state NOT IN ('rejected', 'archived') AND t.verification_state NOT IN ('rejected', 'archived')`,
  );
  return {
    nodes: n.rows.map((c) => ({ id: c.id, key: c.key, title: c.title, type: c.type, tradition: c.package_slug, state: c.verification_state })),
    edges: e.rows.map((r) => ({ id: r.id, source: r.source_concept_id, target: r.target_concept_id, type: r.type_code, ordinal: r.ordinal, state: r.verification_state })),
  };
}

/** User display names for actor ids. */
export async function userNames(q: Q, ids: readonly (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map();
  const r = await q.query<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ANY($1::text[])", [list]);
  return new Map(r.rows.map((u) => [u.id, u.name]));
}
