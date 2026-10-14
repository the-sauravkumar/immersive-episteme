/**
 * Development bootstrap: one command that leaves the local database with real data for every
 * later work stream.
 *
 *   npm run dev:bootstrap     (runs `docker compose up -d --wait` first, see package.json)
 *
 * Steps (all idempotent; safe to re-run after content changes):
 *  1. migrate the main and the test database;
 *  2. seed reference data and the demo dataset (db/seeds);
 *  3. import content/ (src/server/content/import-content.ts);
 *  4. build the REVIEW snapshot from the database (kind 'review', draft, never publishable);
 *  5. compile spatial manifests from it: the three shortlisted traditions together (the demo
 *     museum) and each of them alone;
 *  6. create / update the demo study `demo-review-walkthrough` pinned to that snapshot and the
 *     combined manifest: is_demo, config.nonExperimental, stays in draft (a review snapshot can
 *     never be published, so no study can be activated on it). The demo and staff preview of
 *     /learn/* use it to pick the manifest and the traditions (src/server/learning/context-data.ts).
 *
 * Refuses to run against a non-local database. Prints the real row counts at the end.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";

import { seeds } from "../../db/seeds";
import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { importContent } from "../../src/server/content/import-content";
import { storeReviewSnapshot } from "../../src/server/content/review-snapshot";
import { compileAndStoreManifest, type StoredManifest } from "../../src/server/spatial/manifest-store";
import { REPO_ROOT, loadAndValidate } from "../content/_shared";
import { isLocalHost, makePool, redact, runMigrations } from "../db/_shared";

export const SHORTLIST = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"] as const;
export const DEMO_REVIEW_STUDY_SLUG = "demo-review-walkthrough";

const log = (msg: string) => console.log(`[dev:bootstrap] ${msg}`);

async function ensureDemoStudy(client: PoolClient, snapshotId: string, manifest: StoredManifest): Promise<string> {
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
  } else if (existing.rows[0]!.status === "draft") {
    await client.query("UPDATE studies SET snapshot_id = $2, manifest_id = $3, config = $4::jsonb WHERE id = $1", [id, snapshotId, manifest.id, JSON.stringify(config)]);
  } else {
    throw new Error(`${DEMO_REVIEW_STUDY_SLUG} is ${existing.rows[0]!.status}; expected draft`);
  }
  await client.query(
    `INSERT INTO study_conditions (study_id, code, label, interface, position)
     VALUES ($1, 'conventional', 'Conventional 2D pages', 'conventional_2d', 0), ($1, 'immersive', 'Immersive 3D museum', 'immersive_3d', 1)
     ON CONFLICT (study_id, code) DO NOTHING`,
    [id],
  );
  return id;
}

async function counts(client: PoolClient): Promise<Record<string, string>> {
  const tables = [
    "content_packages", "traditions", "sources", "concepts", "concept_claims", "concept_claim_sources", "relationships",
    "relationship_sources", "tradition_sources", "media_candidates", "content_snapshots", "snapshot_items", "mapping_rule_sets",
    "spatial_manifests", "spatial_elements", "spatial_element_encodings", "studies", "study_conditions", "event_types", "audit_log",
  ];
  const out: Record<string, string> = {};
  for (const t of tables) {
    const r = await client.query<{ all: number; real: number | null }>(
      `SELECT count(*)::int AS all, ${["mapping_rule_sets", "content_packages", "traditions", "sources", "concepts", "concept_claims", "concept_claim_sources", "relationships", "relationship_sources", "tradition_sources", "media_candidates", "content_snapshots", "snapshot_items", "spatial_manifests", "studies"].includes(t) ? "count(*) FILTER (WHERE NOT is_demo)::int" : "NULL::int"} AS real FROM ${t}`,
    );
    const row = r.rows[0]!;
    out[t] = row.real === null ? `${row.all}` : `${row.all} (real ${row.real}, demo ${row.all - row.real})`;
  }
  return out;
}

async function main(): Promise<void> {
  const mainUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!mainUrl) throw new Error("DATABASE_URL is not set. Copy .env.example to .env (see README).");
  for (const u of [mainUrl, testUrl].filter((x): x is string => !!x)) {
    if (!isLocalHost(u)) throw new Error(`Refusing to bootstrap a non-local database: ${redact(u)}`);
  }

  if (testUrl) {
    const testPool = makePool(testUrl);
    try {
      log(`test database ${redact(testUrl)}: ${await runMigrations(testPool)}`);
    } finally {
      await testPool.end();
    }
  }

  const pool = makePool(mainUrl);
  const client = await pool.connect();
  try {
    log(`main database ${redact(mainUrl)}: ${await runMigrations(pool)}`);
    const db = drizzle(pool, { casing: "snake_case" });
    for (const seed of seeds) {
      await seed.run(db);
      log(`seed ${seed.name} ok`);
    }

    const { model, report } = loadAndValidate(`${REPO_ROOT}/content`);
    const s = await importContent(client, { model, issues: report.issues, hasher: nodeSha256, invokedBy: "npm run dev:bootstrap" });
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

    const studyId = await ensureDemoStudy(client, snap.id, combined);
    log(`demo study ${DEMO_REVIEW_STUDY_SLUG}: id ${studyId} (is_demo, non-experimental, draft) snapshot ${snap.id} manifest ${combined.id}`);

    log("row counts:");
    for (const [t, n] of Object.entries(await counts(client))) log(`  ${t.padEnd(26)} ${n}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[dev:bootstrap] failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
