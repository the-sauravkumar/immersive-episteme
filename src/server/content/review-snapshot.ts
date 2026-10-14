/**
 * REVIEW snapshot from the database.
 *
 * Reads the real (non-demo) knowledge rows, adapts them into the knowledge-graph model, runs the
 * same validators and snapshot builder as `scripts/content/build-snapshot.ts`
 * (src/features/knowledge/graph/snapshot.ts, kind "review"), binds the bundle to the database
 * row ids, and stores it as `content_snapshots` row with `kind = 'review'`, `status = 'draft'`,
 * `includes_unverified = true`, `is_demo = false`, plus one `snapshot_items` row per entity.
 *
 * Why a draft row with kind 'review' (see db/migrations/0006, 0007):
 *  - the publishing schema allows non-publishable drafts; a review snapshot holds
 *    under_review / needs_evidence content, which only an `includes_unverified` snapshot may hold;
 *  - `content_snapshots_review_ck` forbids a review snapshot from ever being published, and the
 *    study activation trigger (0005) only activates on a published snapshot, so no study can run
 *    on it; 0007 additionally stops any non-demo study (even a draft) from referencing it or a
 *    manifest compiled from it. A demo study may reference it (non-experimental).
 *
 * Snapshots are immutable by convention here too: the version label is
 * `review-<first 12 hex of the content hash>`, and an existing row with that label is reused,
 * never rewritten. New content therefore always produces a new row.
 *
 * Which rows: every non-demo tradition, source, concept and relationship whose state is
 * under_review, needs_evidence, verified or published (draft, rejected and archived rows are
 * left out), and relationships only between included concepts.
 *
 * Not `server-only` (scripts and integration tests call it).
 */
import type { PoolClient } from "pg";

import { knowledgeBundleSchema, type KnowledgeBundle, type SnapshotItem } from "@/features/knowledge/contracts";
import { postgresJsonbText } from "@/features/knowledge/graph/canonical-json";
import { hashCanonical, type Sha256Hasher } from "@/features/knowledge/graph/hash";
import { buildSnapshot, contentHash, contentIds, snapshotItems, type SnapshotEnvelope, type SnapshotRefusal } from "@/features/knowledge/graph/snapshot";
import type { GraphConcept, GraphPackage, GraphRelationship, GraphSource, KnowledgeGraphModel } from "@/features/knowledge/graph/types";
import { relationshipId, validateGraph } from "@/features/knowledge/graph/validate";
import type { ConceptType, KnowledgeCategoryCode, ProvenanceKind, SourceReliability, VerificationState } from "@/lib/validation/enums";

type Q = Pick<PoolClient, "query">;

/** Review states admitted into a review snapshot. */
export const REVIEW_SNAPSHOT_STATES: readonly VerificationState[] = ["under_review", "needs_evidence", "verified", "published"];

interface DbModel {
  model: KnowledgeGraphModel;
  /** name-based id (contentIds) -> database id, for every entity in the model. */
  dbIdByNameId: Map<string, string>;
}

/** Adapts the real knowledge rows into the validator/builder model. */
export async function loadModelFromDb(q: Q, hasher: Sha256Hasher): Promise<DbModel> {
  const states = REVIEW_SNAPSHOT_STATES as string[];
  const pk = await q.query<{ id: string; slug: string; kind: string; source_path: string | null; file_sha256: string | null; name: string; alt_names: string[]; summary: string | null }>(
    "SELECT id, slug, kind, source_path, file_sha256, name, alt_names, summary FROM content_packages WHERE NOT is_demo ORDER BY slug",
  );
  const tr = await q.query<{
    id: string; slug: string; package_id: string | null; name: string; alt_names: string[]; summary: string | null;
    region_place: string | null; region_district: string | null; region_state: string | null; region_country: string | null;
    latitude: number | null; longitude: number | null; gi_registered: boolean | null; gi_application_no: string | null; gi_year: number | null;
  }>("SELECT * FROM traditions WHERE NOT is_demo AND verification_state = ANY($1::verification_state[]) ORDER BY slug", [states]);
  const so = await q.query<{
    id: string; package_slug: string | null; local_key: string | null; kind: ProvenanceKind; title: string; author: string | null; publisher: string | null;
    year: number | null; url: string | null; accessed_on: string | null; reliability: SourceReliability | null; notes: string | null; verification_state: VerificationState;
  }>(
    `SELECT s.id, p.slug AS package_slug, s.local_key, s.kind, s.title, s.author, s.publisher, s.year, s.url,
            to_char(s.accessed_on, 'YYYY-MM-DD') AS accessed_on, s.reliability, s.notes, s.verification_state
       FROM sources s LEFT JOIN content_packages p ON p.id = s.package_id
      WHERE NOT s.is_demo AND s.verification_state = ANY($1::verification_state[])`,
    [states],
  );
  const co = await q.query<{
    id: string; key: string; type: ConceptType; category_code: KnowledgeCategoryCode; tradition_slug: string | null; package_slug: string | null;
    title: string; summary: string; body_md: string | null; local_terms: string[]; compares: string[]; provenance_kind: ProvenanceKind; verification_state: VerificationState;
  }>(
    `SELECT c.id, c.key, c.type, c.category_code, t.slug AS tradition_slug, p.slug AS package_slug, c.title, c.summary, c.body_md,
            c.local_terms, c.compares, c.provenance_kind, c.verification_state
       FROM concepts c LEFT JOIN traditions t ON t.id = c.tradition_id LEFT JOIN content_packages p ON p.id = c.package_id
      WHERE NOT c.is_demo AND c.verification_state = ANY($1::verification_state[])`,
    [states],
  );
  const cl = await q.query<{ id: string; concept_id: string; position: number; text: string; quote: string | null; source_ids: string[] | null }>(
    `SELECT cc.id, cc.concept_id, cc.position, cc.text, cc.quote,
            array_agg(cs.source_id::text ORDER BY cs.source_id) FILTER (WHERE cs.source_id IS NOT NULL) AS source_ids
       FROM concept_claims cc LEFT JOIN concept_claim_sources cs ON cs.claim_id = cc.id
      WHERE NOT cc.is_demo
      GROUP BY cc.id ORDER BY cc.concept_id, cc.position`,
  );
  const re = await q.query<{
    id: string; source_concept_id: string; target_concept_id: string; type_code: string; package_slug: string | null; explanation: string | null; conditions: string | null;
    strength: number | null; ordinal: number | null; provenance_kind: ProvenanceKind; verification_state: VerificationState; source_ids: string[] | null;
  }>(
    `SELECT r.id, r.source_concept_id, r.target_concept_id, r.type_code, p.slug AS package_slug, r.explanation, r.conditions, r.strength, r.ordinal,
            r.provenance_kind, r.verification_state,
            array_agg(rs.source_id::text ORDER BY rs.source_id) FILTER (WHERE rs.source_id IS NOT NULL) AS source_ids
       FROM relationships r LEFT JOIN content_packages p ON p.id = r.package_id LEFT JOIN relationship_sources rs ON rs.relationship_id = r.id
      WHERE NOT r.is_demo AND r.verification_state = ANY($1::verification_state[])
      GROUP BY r.id, p.slug`,
    [states],
  );
  const gi = await q.query<{ tradition_id: string; source_id: string }>("SELECT tradition_id, source_id FROM tradition_sources WHERE NOT is_demo AND purpose = 'gi'");
  const media = await q.query<{ package_slug: string; url: string; title: string; licence: string | null; author: string | null; depicts_key: string | null; width: number | null; height: number | null; mime_type: string | null; dimensions_source: string | null }>(
    `SELECT p.slug AS package_slug, m.url, m.title, m.licence, m.author, m.depicts_key, m.width, m.height, m.mime_type, m.dimensions_source
       FROM media_candidates m JOIN content_packages p ON p.id = m.package_id WHERE NOT m.is_demo ORDER BY m.url`,
  );

  const ids = contentIds(hasher);
  const dbIdByNameId = new Map<string, string>();

  // Sources: global ref = <package slug>#<local id>; CMS-authored sources (no package) use cms#<id>.
  const refBySourceId = new Map<string, string>();
  const sources: GraphSource[] = so.rows.map((s) => {
    const packageSlug = s.package_slug ?? "cms";
    const localId = s.local_key ?? s.id;
    const ref = `${packageSlug}#${localId}`;
    refBySourceId.set(s.id, ref);
    dbIdByNameId.set(ids.source(ref), s.id);
    return {
      ref, packageSlug, localId, kind: s.kind, title: s.title, author: s.author, publisher: s.publisher, year: s.year, url: s.url,
      accessed: s.accessed_on, reliability: s.reliability, notes: s.notes, verificationState: s.verification_state,
    };
  });

  const traditionBySlug = new Map(tr.rows.map((t) => [t.slug, t]));
  const giByTradition = new Map<string, string[]>();
  for (const g of gi.rows) {
    const ref = refBySourceId.get(g.source_id);
    if (ref) giByTradition.set(g.tradition_id, [...(giByTradition.get(g.tradition_id) ?? []), ref]);
  }
  const mediaBySlug = new Map<string, GraphPackage["mediaCandidates"]>();
  for (const m of media.rows) {
    mediaBySlug.set(m.package_slug, [
      ...(mediaBySlug.get(m.package_slug) ?? []),
      { url: m.url, title: m.title, licence: m.licence, author: m.author, depicts: m.depicts_key, width: m.width, height: m.height, mime: m.mime_type, dimensionsSource: m.dimensions_source },
    ]);
  }

  const packages: GraphPackage[] = [];
  for (const t of tr.rows) {
    dbIdByNameId.set(ids.tradition(t.slug), t.id);
    const p = pk.rows.find((x) => x.id === t.package_id);
    packages.push({
      slug: t.slug,
      kind: "tradition",
      path: p?.source_path ?? `db:traditions/${t.slug}`,
      fileSha256: p?.file_sha256 ?? null,
      name: t.name,
      altNames: t.alt_names,
      summary: t.summary,
      region: { place: t.region_place, district: t.region_district, state: t.region_state, country: t.region_country, lat: t.latitude, lon: t.longitude },
      gi: t.gi_registered === null ? null : { registered: t.gi_registered, applicationNo: t.gi_application_no, year: t.gi_year, sourceRefs: giByTradition.get(t.id) ?? [] },
      mediaCandidates: mediaBySlug.get(t.slug) ?? [],
      isDemo: false,
    });
  }
  for (const p of pk.rows) {
    if (p.kind === "tradition" || traditionBySlug.has(p.slug)) continue;
    packages.push({
      slug: p.slug,
      kind: p.kind === "comparisons" ? "comparisons" : "shared",
      path: p.source_path ?? `db:content_packages/${p.slug}`,
      fileSha256: p.file_sha256,
      name: p.name,
      altNames: p.alt_names,
      summary: p.summary,
      region: null,
      gi: null,
      mediaCandidates: mediaBySlug.get(p.slug) ?? [],
      isDemo: false,
    });
  }

  const claimsByConcept = new Map<string, typeof cl.rows>();
  for (const c of cl.rows) claimsByConcept.set(c.concept_id, [...(claimsByConcept.get(c.concept_id) ?? []), c]);
  const keyById = new Map<string, string>();
  const concepts: GraphConcept[] = co.rows.map((c) => {
    keyById.set(c.id, c.key);
    dbIdByNameId.set(ids.concept(c.key), c.id);
    const claims = (claimsByConcept.get(c.id) ?? []).sort((a, b) => a.position - b.position);
    claims.forEach((x, i) => dbIdByNameId.set(ids.claim(c.key, i), x.id));
    const refs = (xs: string[] | null) => (xs ?? []).map((sid) => refBySourceId.get(sid)).filter((r): r is string => !!r);
    return {
      key: c.key,
      // A tradition concept belongs to its tradition (the builder keys traditionId by package slug).
      packageSlug: c.tradition_slug ?? c.package_slug ?? "cms",
      type: c.type,
      category: c.category_code,
      title: c.title,
      summary: c.summary,
      bodyMd: c.body_md,
      localTerms: c.local_terms,
      compares: c.compares,
      provenanceKind: c.provenance_kind,
      verificationState: c.verification_state,
      claims: claims.map((x) => ({ text: x.text, quote: x.quote, sourceRefs: refs(x.source_ids), rawSourceIds: refs(x.source_ids) })),
      prosePolicy: null,
      isDemo: false,
    };
  });

  const relationships: GraphRelationship[] = [];
  re.rows
    .filter((r) => keyById.has(r.source_concept_id) && keyById.has(r.target_concept_id))
    .forEach((r, index) => {
      const rel: GraphRelationship = {
        packageSlug: r.package_slug ?? "cms",
        index,
        source: keyById.get(r.source_concept_id)!,
        target: keyById.get(r.target_concept_id)!,
        type: r.type_code,
        explanation: r.explanation,
        conditions: r.conditions,
        ordinal: r.ordinal,
        strength: r.strength,
        provenanceKind: r.provenance_kind,
        verificationState: r.verification_state,
        sourceRefs: (r.source_ids ?? []).map((sid) => refBySourceId.get(sid)).filter((x): x is string => !!x),
        rawSourceIds: r.source_ids ?? [],
      };
      dbIdByNameId.set(ids.relationship(relationshipId(rel)), r.id);
      relationships.push(rel);
    });

  return { model: { packages, sources, concepts, relationships }, dbIdByNameId };
}

/** Replaces every name-based id in the bundle by its database id; re-sorts id-ordered arrays. */
function bindToDbIds(bundle: KnowledgeBundle, map: ReadonlyMap<string, string>): KnowledgeBundle {
  const swap = (id: string) => map.get(id) ?? id;
  const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {
    ...bundle,
    traditions: bundle.traditions.map((t) => ({ ...t, id: swap(t.id), gi: t.gi ? { ...t.gi, sourceIds: t.gi.sourceIds.map(swap) } : null })),
    sources: bundle.sources.map((s) => ({ ...s, id: swap(s.id) })).sort(byId),
    concepts: bundle.concepts.map((c) => ({
      ...c,
      id: swap(c.id),
      traditionId: c.traditionId ? swap(c.traditionId) : null,
      claims: c.claims.map((cl) => ({ ...cl, id: swap(cl.id), sources: cl.sources.map((s) => ({ ...s, sourceId: swap(s.sourceId) })) })),
    })),
    relationships: bundle.relationships
      .map((r) => ({ ...r, id: swap(r.id), sources: r.sources.map((s) => ({ ...s, sourceId: swap(s.sourceId) })).sort((a, b) => (a.sourceId < b.sourceId ? -1 : 1)) }))
      .sort(byId),
  };
}

export type ReviewSnapshotBuild =
  | { ok: true; envelope: SnapshotEnvelope }
  | { ok: false; refusals: SnapshotRefusal[] };

/** Builds (does not store) the review snapshot envelope from the current database rows. */
export async function buildReviewSnapshotFromDb(q: Q, opts: { hasher: Sha256Hasher; generatedAt: string }): Promise<ReviewSnapshotBuild> {
  const { model, dbIdByNameId } = await loadModelFromDb(q, opts.hasher);
  const issues = validateGraph(model);
  const built = buildSnapshot(model, { kind: "review", hasher: opts.hasher, generatedAt: opts.generatedAt, issues });
  if (!built.ok) return { ok: false, refusals: built.refusals };

  const bound = bindToDbIds(built.snapshot.payload, dbIdByNameId);
  const contentSha256 = contentHash(bound, opts.hasher);
  const versionLabel = `review-${contentSha256.slice(0, 12)}`;
  const payload: KnowledgeBundle = { ...bound, versionLabel };
  const parsed = knowledgeBundleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, refusals: parsed.error.issues.slice(0, 20).map((i) => ({ code: "KG900", message: `${i.path.join(".")}: ${i.message}` })) };
  }
  const items: SnapshotItem[] = snapshotItems(payload, opts.hasher);
  return {
    ok: true,
    envelope: {
      ...built.snapshot,
      versionLabel,
      contentSha256,
      payloadSha256: hashCanonical(opts.hasher, payload),
      predictedDbPayloadSha256: opts.hasher.sha256Hex(postgresJsonbText(payload)),
      itemCount: items.length,
      items,
      payload,
    },
  };
}

export interface StoredReviewSnapshot {
  id: string;
  versionLabel: string;
  payloadSha256: string;
  contentSha256: string;
  itemCount: number;
  created: boolean;
}

/**
 * Builds the review snapshot and stores it unless a snapshot with the same content label
 * already exists (then that row is returned untouched). Runs in its own transaction.
 */
export async function storeReviewSnapshot(
  client: PoolClient,
  opts: { hasher: Sha256Hasher; generatedAt?: string; createdBy?: string | null },
): Promise<StoredReviewSnapshot> {
  await client.query("BEGIN");
  try {
    const build = await buildReviewSnapshotFromDb(client, { hasher: opts.hasher, generatedAt: opts.generatedAt ?? new Date().toISOString() });
    if (!build.ok) {
      throw new Error(`Review snapshot refused: ${build.refusals.map((r) => `${r.code} ${r.message}`).join("; ")}`);
    }
    const e = build.envelope;
    const existing = await client.query<{ id: string; payload_sha256: string; item_count: number; kind: string }>(
      "SELECT id, payload_sha256, (SELECT count(*)::int FROM snapshot_items WHERE snapshot_id = s.id) AS item_count, kind FROM content_snapshots s WHERE version_label = $1",
      [e.versionLabel],
    );
    if (existing.rows[0]) {
      await client.query("COMMIT");
      const r = existing.rows[0];
      if (r.kind !== "review") throw new Error(`Snapshot ${e.versionLabel} exists but is not a review snapshot`);
      return { id: r.id, versionLabel: e.versionLabel, payloadSha256: r.payload_sha256, contentSha256: e.contentSha256, itemCount: r.item_count, created: false };
    }
    const ins = await client.query<{ id: string; payload_sha256: string }>(
      `INSERT INTO content_snapshots (version_label, title, description, kind, status, schema_version, payload, includes_unverified, is_demo, created_by)
       VALUES ($1, $2, $3, 'review', 'draft', 1, $4::jsonb, true, false, $5) RETURNING id, payload_sha256`,
      [e.versionLabel, `Review snapshot ${e.versionLabel}`, e.notice, JSON.stringify(e.payload), opts.createdBy ?? null],
    );
    const id = ins.rows[0]!.id;
    await client.query(
      `INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, entity_key, item_sha256, is_demo)
       SELECT $1, item_kind::snapshot_item_kind, entity_ref, entity_key, item_sha256, false
         FROM jsonb_to_recordset($2::jsonb) AS x(item_kind text, entity_ref text, entity_key text, item_sha256 text)`,
      [id, JSON.stringify(e.items.map((i) => ({ item_kind: i.itemKind, entity_ref: i.entityRef, entity_key: i.entityKey ?? null, item_sha256: i.itemSha256 })))],
    );
    await client.query(
      `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason)
       VALUES ('system', 'content-importer', 'snapshot.review_built', 'content_snapshots', $1, $2::jsonb, $3)`,
      [
        id,
        JSON.stringify({ versionLabel: e.versionLabel, contentSha256: e.contentSha256, payloadSha256: ins.rows[0]!.payload_sha256, items: e.itemCount, verificationCounts: e.verificationCounts, integrity: e.integrity }),
        "review snapshot built from the database (not publishable, not for use in a study)",
      ],
    );
    await client.query("COMMIT");
    return { id, versionLabel: e.versionLabel, payloadSha256: ins.rows[0]!.payload_sha256, contentSha256: e.contentSha256, itemCount: e.itemCount, created: true };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}
