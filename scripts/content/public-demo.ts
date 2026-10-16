/**
 * The public demo museum, shared by `npm run dev:bootstrap` (local) and
 * `npm run content:bootstrap:remote` (production): import content/, build the REVIEW snapshot,
 * compile the spatial manifests, and create or update the demo study `demo-review-walkthrough`.
 *
 * No side effects on import. Nothing here creates users, staff accounts, participants or demo
 * seed rows: dev:bootstrap adds those itself (db/seeds), the remote command never does.
 *
 * Every step is idempotent: a second run over unchanged content/ inserts and updates no content,
 * snapshot, manifest or study row. The importer's own bookkeeping still records each run, by
 * design (src/server/content/import-content.ts): one audit_log row ('content.import') and
 * content_packages.imported_at set to the time of the run.
 */
import type { PoolClient } from "pg";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { importContent } from "../../src/server/content/import-content";
import { storeReviewSnapshot } from "../../src/server/content/review-snapshot";
import { compileAndStoreManifest, type StoredManifest } from "../../src/server/spatial/manifest-store";

import { REPO_ROOT, loadAndValidate } from "./_shared";

export const SHORTLIST = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"] as const;
export const DEMO_REVIEW_STUDY_SLUG = "demo-review-walkthrough";

/** Creates the demo study, or updates it while it is a draft and only when something differs. */
export async function ensureDemoStudy(
  client: PoolClient,
  snapshotId: string,
  manifest: StoredManifest,
): Promise<{ id: string; action: "created" | "updated" | "unchanged" }> {
  const config = {
    traditionSlugs: [...SHORTLIST],
    nonExperimental: true,
    searchEnabled: true,
    notes:
      "Development demo pinned to the REVIEW snapshot (content not verified by a curator). Never experimental, " +
      "never activatable: review snapshots cannot be published.",
  };
  const existing = await client.query<{ id: string; status: string }>("SELECT id, status FROM studies WHERE slug = $1", [DEMO_REVIEW_STUDY_SLUG]);
  let id = existing.rows[0]?.id;
  let action: "created" | "updated" | "unchanged" = "unchanged";
  if (!id) {
    const r = await client.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, snapshot_id, manifest_id, config, allow_unverified_content, is_demo)
       VALUES ($1, $2, $3, 'demo-1', 'between', $4, $5, $6::jsonb, true, true) RETURNING id`,
      [
        DEMO_REVIEW_STUDY_SLUG,
        "Demo: Review-content walkthrough (non-experimental)",
        "Demo study for development and the public demo. Not a real study; its data is never experimental.",
        snapshotId,
        manifest.id,
        JSON.stringify(config),
      ],
    );
    id = r.rows[0]!.id;
    action = "created";
  } else if (existing.rows[0]!.status === "draft") {
    const u = await client.query(
      `UPDATE studies SET snapshot_id = $2, manifest_id = $3, config = $4::jsonb
        WHERE id = $1 AND (snapshot_id IS DISTINCT FROM $2 OR manifest_id IS DISTINCT FROM $3 OR config IS DISTINCT FROM $4::jsonb)`,
      [id, snapshotId, manifest.id, JSON.stringify(config)],
    );
    if ((u.rowCount ?? 0) > 0) action = "updated";
  } else {
    throw new Error(`${DEMO_REVIEW_STUDY_SLUG} is ${existing.rows[0]!.status}; expected draft`);
  }
  const c = await client.query(
    `INSERT INTO study_conditions (study_id, code, label, interface, position)
     VALUES ($1, 'conventional', 'Conventional 2D pages', 'conventional_2d', 0), ($1, 'immersive', 'Immersive 3D museum', 'immersive_3d', 1)
     ON CONFLICT (study_id, code) DO NOTHING`,
    [id],
  );
  if (action === "unchanged" && (c.rowCount ?? 0) > 0) action = "updated";
  return { id, action };
}

export interface PublicDemoResult {
  snapshotId: string;
  combinedManifestId: string;
  studyId: string;
  study: "created" | "updated" | "unchanged";
}

/** Steps 3-6 of dev:bootstrap: content import, review snapshot, manifests, demo study. */
export async function buildPublicDemo(client: PoolClient, opts: { invokedBy: string; log: (msg: string) => void }): Promise<PublicDemoResult> {
  const { log } = opts;
  const { model, report } = loadAndValidate(`${REPO_ROOT}/content`);
  const s = await importContent(client, { model, issues: report.issues, hasher: nodeSha256, invokedBy: opts.invokedBy });
  log(
    `content import: concepts +${s.concepts.inserted} ~${s.concepts.updated} =${s.concepts.unchanged}; relationships +${s.relationships.inserted} ~${s.relationships.updated} =${s.relationships.unchanged}; ` +
      `sources +${s.sources.inserted} =${s.sources.unchanged}; media +${s.mediaCandidates.inserted} =${s.mediaCandidates.unchanged}`,
  );

  const snap = await storeReviewSnapshot(client, { hasher: nodeSha256 });
  log(`review snapshot ${snap.created ? "created" : "unchanged"}: id ${snap.id} label ${snap.versionLabel} payload_sha256 ${snap.payloadSha256} items ${snap.itemCount}`);

  const combined = await compileAndStoreManifest(client, { snapshotId: snap.id, traditions: [...SHORTLIST] });
  const manifests = [combined];
  for (const t of SHORTLIST) manifests.push(await compileAndStoreManifest(client, { snapshotId: snap.id, traditions: [t] }));
  for (const m of manifests) {
    log(`manifest [${m.traditions.join("+")}] ${m.created ? "created" : "unchanged"}: id ${m.id} status ${m.status} manifest_hash ${m.manifestHash} (${m.elements} elements)`);
  }

  const study = await ensureDemoStudy(client, snap.id, combined);
  log(`demo study ${DEMO_REVIEW_STUDY_SLUG} ${study.action}: id ${study.id} (is_demo, non-experimental, draft) snapshot ${snap.id} manifest ${combined.id}`);
  return { snapshotId: snap.id, combinedManifestId: combined.id, studyId: study.id, study: study.action };
}

const DEMO_FLAGGED = new Set([
  "mapping_rule_sets", "content_packages", "traditions", "sources", "concepts", "concept_claims", "concept_claim_sources", "relationships",
  "relationship_sources", "tradition_sources", "media_candidates", "content_snapshots", "snapshot_items", "spatial_manifests", "studies",
]);

export const COUNTED_TABLES = [
  "content_packages", "traditions", "sources", "concepts", "concept_claims", "concept_claim_sources", "relationships",
  "relationship_sources", "tradition_sources", "media_candidates", "content_snapshots", "snapshot_items", "mapping_rule_sets",
  "spatial_manifests", "spatial_elements", "spatial_element_encodings", "studies", "study_conditions", "event_types", "audit_log",
] as const;

/** Row counts per table, split into real and demo rows where the table has is_demo. */
export async function counts(client: Pick<PoolClient, "query">): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of COUNTED_TABLES) {
    const r = await client.query<{ all: number; real: number | null }>(
      `SELECT count(*)::int AS all, ${DEMO_FLAGGED.has(t) ? "count(*) FILTER (WHERE NOT is_demo)::int" : "NULL::int"} AS real FROM ${t}`,
    );
    const row = r.rows[0]!;
    out[t] = row.real === null ? `${row.all}` : `${row.all} (real ${row.real}, demo ${row.all - row.real})`;
  }
  return out;
}
