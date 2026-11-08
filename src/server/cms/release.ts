import type { Pool, PoolClient } from "pg";

import { knowledgeBundleSchema, type KnowledgeBundle, type SnapshotItem } from "@/features/knowledge/contracts";
import { hashCanonical } from "@/features/knowledge/graph/hash";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { createRegistry, type RelationshipTypeRegistry } from "@/features/knowledge/graph/registry";
import { buildSnapshot, contentHash, snapshotItems, type SnapshotRefusal } from "@/features/knowledge/graph/snapshot";
import type { IntegrityIssue } from "@/features/knowledge/graph/types";
import { validateGraph } from "@/features/knowledge/graph/validate";
import type { RelationshipTypeDefinition } from "@/features/knowledge/contracts";
import { loadModelFromDb, storeReviewSnapshot, type StoredReviewSnapshot } from "@/server/content/review-snapshot";

import { audit, CmsError, ensure, inActorTx, setChangeReason, type Actor, type Q } from "./core";
import { freezeReleaseFigures } from "./media/service";

export interface ReleaseReadiness {
  ok: boolean;
  refusals: SnapshotRefusal[];
  integrity: { error: number; warning: number; info: number };
  errors: IntegrityIssue[];
  counts: { traditions: number; concepts: number; relationships: number; sources: number; claims: number };
  pending: { kind: string; id: string; label: string; state: string }[];
}

export async function relationshipRegistry(q: Q): Promise<RelationshipTypeRegistry> {
  const r = await q.query<{ code: string; label: string; inverse_label: string | null; description: string; semantics: RelationshipTypeDefinition["semantics"]; directed: boolean; allows_cycles: boolean; ordered: boolean; requires_evidence: boolean; is_core: boolean }>(
    "SELECT code, label, inverse_label, description, semantics, directed, allows_cycles, ordered, requires_evidence, is_core FROM relationship_types ORDER BY code",
  );
  return createRegistry(
    r.rows.map((t) => ({
      code: t.code, label: t.label, inverseLabel: t.inverse_label, description: t.description, semantics: t.semantics,
      directed: t.directed, allowsCycles: t.allows_cycles, ordered: t.ordered, requiresEvidence: t.requires_evidence, isCore: t.is_core,
    })),
  );
}

const PIPELINE = "('under_review','needs_evidence','verified','published')";

async function pendingRows(q: Q): Promise<ReleaseReadiness["pending"]> {
  const r = await q.query<{ kind: string; id: string; label: string; state: string }>(
    `(SELECT 'tradition' AS kind, id::text, name AS label, verification_state::text AS state FROM traditions
       WHERE NOT is_demo AND verification_state IN ('under_review','needs_evidence') ORDER BY name LIMIT 50)
     UNION ALL
     (SELECT 'concept', id::text, key, verification_state::text FROM concepts
       WHERE NOT is_demo AND verification_state IN ('under_review','needs_evidence') ORDER BY key LIMIT 50)
     UNION ALL
     (SELECT 'relationship', r.id::text, s.key || ' ' || r.type_code || ' ' || t.key, r.verification_state::text
        FROM relationships r JOIN concepts s ON s.id = r.source_concept_id JOIN concepts t ON t.id = r.target_concept_id
       WHERE NOT r.is_demo AND r.verification_state IN ('under_review','needs_evidence') ORDER BY 3 LIMIT 50)
     UNION ALL
     (SELECT 'source', id::text, title, verification_state::text FROM sources
       WHERE NOT is_demo AND verification_state IN ('under_review','needs_evidence') ORDER BY title LIMIT 50)
     UNION ALL
     (SELECT 'cited source outside the pipeline', s.id::text, s.title, s.verification_state::text FROM sources s
       WHERE NOT s.is_demo AND s.verification_state NOT IN ${PIPELINE}
         AND (EXISTS (SELECT 1 FROM concept_claim_sources cs JOIN concept_claims cc ON cc.id = cs.claim_id JOIN concepts c ON c.id = cc.concept_id
                       WHERE cs.source_id = s.id AND NOT c.is_demo AND c.verification_state IN ${PIPELINE})
           OR EXISTS (SELECT 1 FROM relationship_sources rs JOIN relationships r ON r.id = rs.relationship_id
                       WHERE rs.source_id = s.id AND NOT r.is_demo AND r.verification_state IN ${PIPELINE}))
       ORDER BY s.title LIMIT 50)
     UNION ALL
     (SELECT 'concept of a tradition outside the pipeline', c.id::text, c.key, c.verification_state::text
        FROM concepts c JOIN traditions t ON t.id = c.tradition_id
       WHERE NOT c.is_demo AND c.verification_state IN ${PIPELINE} AND t.verification_state NOT IN ${PIPELINE}
       ORDER BY c.key LIMIT 50)`,
  );
  return r.rows;
}

async function outsideDependencies(q: Q): Promise<SnapshotRefusal[]> {
  const r = await q.query<{ claims: number; rels: number; orphans: number }>(
    `SELECT
       (SELECT count(DISTINCT cc.id)::int FROM concept_claims cc JOIN concepts c ON c.id = cc.concept_id
          JOIN concept_claim_sources cs ON cs.claim_id = cc.id JOIN sources s ON s.id = cs.source_id
         WHERE NOT c.is_demo AND c.verification_state IN ${PIPELINE} AND s.verification_state NOT IN ${PIPELINE}) AS claims,
       (SELECT count(DISTINCT r.id)::int FROM relationships r JOIN relationship_sources rs ON rs.relationship_id = r.id
          JOIN sources s ON s.id = rs.source_id
         WHERE NOT r.is_demo AND r.verification_state IN ${PIPELINE} AND s.verification_state NOT IN ${PIPELINE}) AS rels,
       (SELECT count(*)::int FROM concepts c JOIN traditions t ON t.id = c.tradition_id
         WHERE NOT c.is_demo AND c.verification_state IN ${PIPELINE} AND t.verification_state NOT IN ${PIPELINE}) AS orphans`,
  );
  const { claims, rels, orphans } = r.rows[0]!;
  const out: SnapshotRefusal[] = [];
  if (claims > 0) out.push({ code: "REL004", message: `${claims} claim(s) cite a source that is draft, rejected or archived; the release would drop that citation. Verify the source or remove the citation.` });
  if (rels > 0) out.push({ code: "REL004", message: `${rels} relationship(s) cite a source that is draft, rejected or archived; the release would drop that citation. Verify the source or remove the citation.` });
  if (orphans > 0) out.push({ code: "REL005", message: `${orphans} concept(s) belong to a tradition that is draft, rejected or archived; take those concepts out of the pipeline too, or return the tradition to review.` });
  return out;
}

async function citationGaps(q: Q): Promise<SnapshotRefusal[]> {
  const r = await q.query<{ claims: number; rels: number }>(
    `SELECT
       (SELECT count(DISTINCT cc.id)::int FROM concept_claims cc JOIN concepts c ON c.id = cc.concept_id
          LEFT JOIN concept_claim_sources cs ON cs.claim_id = cc.id
         WHERE NOT c.is_demo AND c.verification_state IN ${PIPELINE}
           AND (cs.source_id IS NULL OR cs.locator IS NULL OR btrim(cs.locator) = '' OR ((cc.quote IS NULL OR btrim(cc.quote) = '') AND jsonb_array_length(cs.evidence) = 0))) AS claims,
       (SELECT count(DISTINCT r.id)::int FROM relationships r JOIN relationship_sources rs ON rs.relationship_id = r.id
         WHERE NOT r.is_demo AND r.verification_state IN ${PIPELINE}
           AND (rs.locator IS NULL OR btrim(rs.locator) = '' OR rs.quote IS NULL OR btrim(rs.quote) = '')) AS rels`,
  );
  const { claims, rels } = r.rows[0]!;
  const out: SnapshotRefusal[] = [];
  if (claims > 0) out.push({ code: "REL002", message: `${claims} claim(s) lack a page/locator or a verbatim quotation (citation policy)` });
  if (rels > 0) out.push({ code: "REL002", message: `${rels} relationship(s) have a citation without a page/locator or quotation` });
  return out;
}

export async function releaseReadiness(q: Q): Promise<ReleaseReadiness> {
  const registry = await relationshipRegistry(q);
  const { model } = await loadModelFromDb(q, nodeSha256);
  const issues = validateGraph(model, { registry });
  const built = buildSnapshot(model, { kind: "publishable", hasher: nodeSha256, generatedAt: new Date().toISOString(), issues, registry });
  const refusals: SnapshotRefusal[] = built.ok ? [] : [...built.refusals];
  const tr = await q.query<{ n: number }>(`SELECT count(*)::int AS n FROM traditions WHERE NOT is_demo AND verification_state IN ('under_review','needs_evidence')`);
  if (tr.rows[0]!.n > 0) refusals.push({ code: "REL001", message: `${tr.rows[0]!.n} tradition record(s) are not verified` });
  refusals.push(...(await citationGaps(q)));
  refusals.push(...(await outsideDependencies(q)));
  if (model.concepts.length === 0) refusals.push({ code: "REL003", message: "Nothing to publish: no concept is in the review pipeline" });
  const integrity = { error: 0, warning: 0, info: 0 };
  for (const i of issues) integrity[i.severity]++;
  return {
    ok: refusals.length === 0,
    refusals,
    integrity,
    errors: issues.filter((i) => i.severity === "error").slice(0, 50),
    counts: {
      traditions: model.packages.filter((p) => p.kind === "tradition").length,
      concepts: model.concepts.length,
      relationships: model.relationships.length,
      sources: model.sources.length,
      claims: model.concepts.reduce((n, c) => n + c.claims.length, 0),
    },
    pending: refusals.length ? await pendingRows(q) : [],
  };
}

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

async function withCitationDetail(q: Q, bundle: KnowledgeBundle): Promise<KnowledgeBundle> {
  const cs = await q.query<{ claim_id: string; source_id: string; locator: string | null }>(
    "SELECT claim_id::text, source_id::text, locator FROM concept_claim_sources WHERE claim_id = ANY($1::uuid[])",
    [bundle.concepts.flatMap((c) => c.claims.map((cl) => cl.id))],
  );
  const claimLoc = new Map(cs.rows.map((r) => [`${r.claim_id}|${r.source_id}`, r.locator]));
  const rs = await q.query<{ relationship_id: string; source_id: string; locator: string | null; quote: string | null }>(
    "SELECT relationship_id::text, source_id::text, locator, quote FROM relationship_sources WHERE relationship_id = ANY($1::uuid[])",
    [bundle.relationships.map((r) => r.id)],
  );
  const relCite = new Map(rs.rows.map((r) => [`${r.relationship_id}|${r.source_id}`, r]));
  return {
    ...bundle,
    concepts: bundle.concepts.map((c) => ({
      ...c,
      claims: c.claims.map((cl) => ({ ...cl, sources: cl.sources.map((s) => ({ ...s, locator: claimLoc.get(`${cl.id}|${s.sourceId}`) ?? null })) })),
    })),
    relationships: bundle.relationships.map((r) => ({
      ...r,
      sources: r.sources.map((s) => {
        const d = relCite.get(`${r.id}|${s.sourceId}`);
        return { ...s, locator: d?.locator ?? null, quote: d?.quote ?? null };
      }),
    })),
  };
}

export interface PublishedRelease {
  id: string;
  versionLabel: string;
  payloadSha256: string;
  contentSha256: string;
  itemCount: number;
  promoted: { concepts: number; relationships: number; sources: number; traditions: number };
}

export interface ReleaseInput {
  versionLabel: string;
  title: string;
  description: string | null;
}

export async function rebuildReviewSnapshot(pool: Pool, actor: Actor): Promise<StoredReviewSnapshot> {
  ensure(actor, "content.publish");
  const client = await pool.connect();
  try {
    return await storeReviewSnapshot(client, { hasher: nodeSha256, createdBy: actor.userId });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Review snapshot refused:")) throw new CmsError("review_snapshot_refused", err.message, 422);
    throw err;
  } finally {
    client.release();
  }
}

export async function publishRelease(pool: Pool, actor: Actor, input: ReleaseInput, opts: { generatedAt?: string } = {}): Promise<PublishedRelease> {
  ensure(actor, "content.publish");
  return inActorTx(pool, actor, `published in release ${input.versionLabel}`, async (c: PoolClient) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext('cms-release'))");
    const exists = await c.query("SELECT 1 FROM content_snapshots WHERE version_label = $1", [input.versionLabel]);
    if (exists.rows.length) throw new CmsError("label_taken", `Version label ${input.versionLabel} is already used`, 409);

    const readiness = await releaseReadiness(c);
    if (!readiness.ok) {
      throw new CmsError("release_refused", "The release was refused; nothing was published.", 422, readiness.refusals);
    }

    const promote = async (table: string) =>
      (await c.query(`UPDATE ${table} SET verification_state = 'published' WHERE NOT is_demo AND verification_state = 'verified'`)).rowCount ?? 0;
    await setChangeReason(c, `published in release ${input.versionLabel}`);
    const promoted = {
      traditions: await promote("traditions"),
      sources: await promote("sources"),
      concepts: await promote("concepts"),
      relationships: await promote("relationships"),
    };

    const registry = await relationshipRegistry(c);
    const { model, dbIdByNameId } = await loadModelFromDb(c, nodeSha256);
    const issues = validateGraph(model, { registry });
    const built = buildSnapshot(model, { kind: "publishable", hasher: nodeSha256, generatedAt: opts.generatedAt ?? new Date().toISOString(), issues, registry, versionLabel: input.versionLabel });
    if (!built.ok) throw new CmsError("release_refused", "The release was refused after promotion; nothing was published.", 422, built.refusals);

    const bound = await withCitationDetail(c, bindToDbIds(built.snapshot.payload, dbIdByNameId));
    const payload: KnowledgeBundle = { ...bound, versionLabel: input.versionLabel, includesUnverified: false, isDemo: false };
    const parsed = knowledgeBundleSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CmsError("release_refused", "The bundle does not satisfy the knowledge-bundle contract.", 422, parsed.error.issues.slice(0, 20).map((i) => ({ code: "SNAP003", message: `${i.path.join(".")}: ${i.message}` })));
    }
    const contentSha256 = contentHash(payload, nodeSha256);
    const items: SnapshotItem[] = snapshotItems(payload, nodeSha256);

    const ins = await c.query<{ id: string }>(
      `INSERT INTO content_snapshots (version_label, title, description, kind, status, schema_version, payload, includes_unverified, is_demo, created_by)
       VALUES ($1, $2, $3, 'release', 'draft', 1, $4::jsonb, false, false, $5) RETURNING id`,
      [input.versionLabel, input.title, input.description, JSON.stringify(payload), actor.userId],
    );
    const id = ins.rows[0]!.id;
    await c.query(
      `INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, entity_key, item_sha256, is_demo)
       SELECT $1, item_kind::snapshot_item_kind, entity_ref, entity_key, item_sha256, false
         FROM jsonb_to_recordset($2::jsonb) AS x(item_kind text, entity_ref text, entity_key text, item_sha256 text)`,
      [id, JSON.stringify(items.map((i) => ({ item_kind: i.itemKind, entity_ref: i.entityRef, entity_key: i.entityKey ?? null, item_sha256: i.itemSha256 })))],
    );
    const figures = await freezeReleaseFigures(c, id);
    const pub = await c.query<{ payload_sha256: string; item_count: number }>(
      "UPDATE content_snapshots SET status = 'published', published_by = $2 WHERE id = $1 RETURNING payload_sha256, item_count",
      [id, actor.userId],
    );
    await audit(c, actor, {
      action: "cms.release.published",
      entity: "content_snapshots",
      entityId: id,
      after: {
        versionLabel: input.versionLabel,
        contentSha256,
        payloadSha256: pub.rows[0]!.payload_sha256,
        bundleSha256: hashCanonical(nodeSha256, payload),
        items: pub.rows[0]!.item_count,
        figures,
        promoted,
        verificationCounts: built.snapshot.verificationCounts,
        integrity: built.snapshot.integrity,
      },
      reason: input.description,
    });
    return { id, versionLabel: input.versionLabel, payloadSha256: pub.rows[0]!.payload_sha256, contentSha256, itemCount: pub.rows[0]!.item_count, promoted };
  });
}
