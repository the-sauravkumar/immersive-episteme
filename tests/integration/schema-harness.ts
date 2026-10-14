/**
 * Test harness for the schema integration tests (tests/integration/schema-*.test.ts).
 *
 * Every test file gets its OWN freshly created database, cloned from nothing and migrated
 * from db/migrations, on the server named by TEST_DATABASE_URL. That makes each run a full
 * reset, and keeps these files independent of each other and of other integration tests that
 * share `episteme_test` (Vitest runs files in parallel). The database is dropped afterwards.
 */
import { randomBytes } from "node:crypto";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import { seedReferenceData } from "../../db/seeds/reference";
import { runMigrations } from "../../scripts/db/_shared";

export const TEST_URL = process.env.TEST_DATABASE_URL;

export type TestDb = {
  name: string;
  pool: Pool;
  db: NodePgDatabase;
  drop: () => Promise<void>;
};

function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export async function createTestDatabase(label: string, opts: { reference?: boolean } = {}): Promise<TestDb> {
  if (!TEST_URL) throw new Error("TEST_DATABASE_URL is not set");
  const base = new URL(TEST_URL).pathname.slice(1) || "episteme_test";
  const name = `${base}_${label}_${randomBytes(4).toString("hex")}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");

  const admin = new Pool({ connectionString: TEST_URL, max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: withDatabase(TEST_URL, name), max: 4 });
  await runMigrations(pool);
  const db = drizzle(pool, { casing: "snake_case" });
  if (opts.reference !== false) await seedReferenceData(db);

  return {
    name,
    pool,
    db,
    drop: async () => {
      await pool.end();
      const a = new Pool({ connectionString: TEST_URL, max: 1 });
      try {
        await a.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}

/** Runs `fn` in a transaction with the transaction-local settings the triggers read. */
export async function withSettings<T>(
  pool: Pool,
  settings: Record<string, string>,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [k, v] of Object.entries(settings)) {
      await client.query("SELECT set_config($1, $2, true)", [k, v]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

type Q = Pick<Pool, "query">;

export async function one<T extends Record<string, unknown>>(q: Q, text: string, params: unknown[] = []): Promise<T> {
  const r = await q.query<T>(text, params);
  if (!r.rows[0]) throw new Error(`no row: ${text}`);
  return r.rows[0];
}

export async function createUser(q: Q, id = `user_${randomBytes(4).toString("hex")}`): Promise<string> {
  await q.query("INSERT INTO users (id, name, email) VALUES ($1, $2, $3)", [id, "Test curator", `${id}@example.test`]);
  return id;
}

const SHA = "a".repeat(64);
export { SHA as FAKE_SHA256 };

/**
 * A minimal real (non-demo) graph: one tradition, one source, two concepts with sourced
 * claims and a PRECEDES relationship. All `under_review` unless `accept` is given, in which
 * case everything is verified by that actor (exercising the acceptance rules).
 */
export async function createRealGraph(
  pool: Pool,
  opts: { prefix?: string; acceptBy?: string } = {},
): Promise<{ traditionId: string; sourceId: string; conceptIds: [string, string]; relationshipId: string }> {
  const p = opts.prefix ?? `t${randomBytes(3).toString("hex")}`;
  const tradition = await one<{ id: string }>(
    pool,
    "INSERT INTO traditions (slug, name, verification_state) VALUES ($1, $2, 'under_review') RETURNING id",
    [`${p}-tradition`, `Test tradition ${p}`],
  );
  const source = await one<{ id: string }>(
    pool,
    "INSERT INTO sources (kind, title, verification_state) VALUES ('historical_documentation', $1, 'under_review') RETURNING id",
    [`Test source ${p}`],
  );
  const conceptIds: string[] = [];
  for (const n of [1, 2]) {
    const c = await one<{ id: string }>(
      pool,
      `INSERT INTO concepts (key, slug, type, category_code, tradition_id, title, provenance_kind, verification_state)
       VALUES ($1, $2, 'process_stage', 'process_stages', $3, $4, 'historical_documentation', 'under_review') RETURNING id`,
      [`${p}.process_stage.step-${n}`, `${p}-process-stage-step-${n}`, tradition.id, `Test step ${n}`],
    );
    const claim = await one<{ id: string }>(
      pool,
      "INSERT INTO concept_claims (concept_id, position, text) VALUES ($1, 0, 'Test claim') RETURNING id",
      [c.id],
    );
    await pool.query("INSERT INTO concept_claim_sources (claim_id, source_id) VALUES ($1, $2)", [claim.id, source.id]);
    conceptIds.push(c.id);
  }
  const rel = await one<{ id: string }>(
    pool,
    `INSERT INTO relationships (source_concept_id, target_concept_id, type_code, ordinal, provenance_kind, verification_state)
     VALUES ($1, $2, 'PRECEDES', 1, 'historical_documentation', 'under_review') RETURNING id`,
    [conceptIds[0], conceptIds[1]],
  );
  await pool.query("INSERT INTO relationship_sources (relationship_id, source_id) VALUES ($1, $2)", [rel.id, source.id]);

  if (opts.acceptBy) {
    await withSettings(pool, { "app.actor_id": opts.acceptBy, "app.change_reason": "test verification" }, async (c) => {
      await c.query("UPDATE traditions SET verification_state = 'verified' WHERE id = $1", [tradition.id]);
      await c.query("UPDATE sources SET verification_state = 'verified' WHERE id = $1", [source.id]);
      await c.query("UPDATE concepts SET verification_state = 'verified' WHERE id = ANY($1::uuid[])", [conceptIds]);
      await c.query("UPDATE relationships SET verification_state = 'verified' WHERE id = $1", [rel.id]);
    });
  }
  return {
    traditionId: tradition.id,
    sourceId: source.id,
    conceptIds: conceptIds as [string, string],
    relationshipId: rel.id,
  };
}

/**
 * Inserts a draft snapshot and returns its id. The payload starts as an empty knowledge-bundle
 * skeleton whose header matches the row; `addSnapshotItem` appends each entity to it, because
 * publication requires the payload entity set to equal the snapshot_items set.
 */
export async function createSnapshot(
  pool: Pool,
  opts: { label: string; isDemo?: boolean; includesUnverified?: boolean; createdBy?: string },
): Promise<string> {
  const isDemo = opts.isDemo ?? false;
  const includesUnverified = opts.includesUnverified ?? false;
  const r = await one<{ id: string }>(
    pool,
    `INSERT INTO content_snapshots (version_label, title, payload, includes_unverified, is_demo, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      opts.label,
      `${isDemo ? "Demo: " : ""}Snapshot ${opts.label}`,
      JSON.stringify(snapshotPayloadSkeleton(opts.label, isDemo, includesUnverified)),
      includesUnverified,
      isDemo,
      opts.createdBy ?? null,
    ],
  );
  return r.id;
}

export function snapshotPayloadSkeleton(label: string, isDemo: boolean, includesUnverified: boolean) {
  return {
    schemaVersion: 1,
    versionLabel: label,
    isDemo,
    includesUnverified,
    categories: [],
    relationshipTypes: [],
    traditions: [],
    sources: [],
    concepts: [],
    relationships: [],
  };
}

/** Payload array and element describing one entity (only what the publish check reads). */
async function payloadEntry(q: Q, kind: string, ref: string): Promise<{ path: string[]; elem: Record<string, unknown> }> {
  switch (kind) {
    case "category":
      return { path: ["categories"], elem: { code: ref } };
    case "relationship_type":
      return { path: ["relationshipTypes"], elem: { code: ref } };
    case "tradition":
      return { path: ["traditions"], elem: { id: ref } };
    case "source":
      return { path: ["sources"], elem: { id: ref } };
    case "relationship":
      return { path: ["relationships"], elem: { id: ref } };
    case "concept": {
      const r = await q.query<{ key: string }>("SELECT key FROM concepts WHERE id::text = $1", [ref]);
      return { path: ["concepts"], elem: { id: ref, key: r.rows[0]?.key ?? null, claims: [], assetIds: [] } };
    }
    default:
      throw new Error(`schema-harness: payload entries for ${kind} items are not supported`);
  }
}

export async function addSnapshotItem(
  q: Q,
  snapshotId: string,
  kind: string,
  ref: string,
  isDemo = false,
): Promise<void> {
  await q.query(
    "INSERT INTO snapshot_items (snapshot_id, item_kind, entity_ref, item_sha256, is_demo) VALUES ($1, $2, $3, $4, $5)",
    [snapshotId, kind, ref, SHA, isDemo],
  );
  const { path, elem } = await payloadEntry(q, kind, ref);
  await q.query(
    `UPDATE content_snapshots
        SET payload = jsonb_set(payload, $2::text[], coalesce(payload #> $2::text[], '[]'::jsonb) || jsonb_build_array($3::jsonb))
      WHERE id = $1`,
    [snapshotId, path, JSON.stringify(elem)],
  );
}

export async function publishSnapshot(q: Q, snapshotId: string, by: string | null): Promise<void> {
  await q.query("UPDATE content_snapshots SET status = 'published', published_by = $2 WHERE id = $1", [snapshotId, by]);
}

/** Frozen rule set + published manifest compiled from `snapshotId`. */
export async function createPublishedManifest(
  pool: Pool,
  snapshotId: string,
  opts: { isDemo?: boolean; by?: string | null } = {},
): Promise<string> {
  const isDemo = opts.isDemo ?? false;
  const rs = await one<{ id: string }>(
    pool,
    `INSERT INTO mapping_rule_sets (name, version, config, is_demo) VALUES ($1, 1, '{"schemaVersion":1,"rules":[]}', $2) RETURNING id`,
    [`${isDemo ? "Demo: " : ""}rules ${randomBytes(3).toString("hex")}`, isDemo],
  );
  await pool.query("UPDATE mapping_rule_sets SET status = 'frozen' WHERE id = $1", [rs.id]);
  const m = await one<{ id: string }>(
    pool,
    `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, manifest, is_demo)
     VALUES ($1, $2, 'test-1.0.0', 'seed-1', '{"schemaVersion":1,"elements":[]}', $3) RETURNING id`,
    [snapshotId, rs.id, isDemo],
  );
  await pool.query("UPDATE spatial_manifests SET status = 'published', published_by = $2 WHERE id = $1", [m.id, opts.by ?? null]);
  return m.id;
}

/** Draft study with a 2D and a 3D condition. */
export async function createStudy(
  pool: Pool,
  opts: { slug: string; snapshotId?: string | null; manifestId?: string | null; isDemo?: boolean; allowUnverified?: boolean },
): Promise<{ studyId: string; conditionIds: { c2d: string; c3d: string } }> {
  const isDemo = opts.isDemo ?? false;
  const s = await one<{ id: string }>(
    pool,
    `INSERT INTO studies (slug, title, protocol_version, design, snapshot_id, manifest_id, is_demo, allow_unverified_content)
     VALUES ($1, $2, 'p1', 'between', $3, $4, $5, $6) RETURNING id`,
    [opts.slug, `${isDemo ? "Demo: " : ""}Study ${opts.slug}`, opts.snapshotId ?? null, opts.manifestId ?? null, isDemo, opts.allowUnverified ?? false],
  );
  const c2d = await one<{ id: string }>(
    pool,
    "INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'conventional', '2D', 'conventional_2d', 0) RETURNING id",
    [s.id],
  );
  const c3d = await one<{ id: string }>(
    pool,
    "INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES ($1, 'immersive', '3D', 'immersive_3d', 1) RETURNING id",
    [s.id],
  );
  return { studyId: s.id, conditionIds: { c2d: c2d.id, c3d: c3d.id } };
}

/** Appends a consent decision for a participant (consent_records is append-only). */
export async function recordConsent(q: Q, participantId: string, decision: "granted" | "declined" | "withdrawn" = "granted"): Promise<void> {
  await q.query(
    "INSERT INTO consent_records (participant_id, consent_version, consent_text_sha256, decision) VALUES ($1, 'c1', $2, $3)",
    [participantId, SHA, decision],
  );
}

/** Enrols a participant (with granted consent unless `consent: false`), allocates them and opens a session. */
export async function createSession(
  pool: Pool,
  studyId: string,
  conditionId: string,
  code: string,
  sequenceIndex = 0,
  opts: { consent?: boolean; contentSetCode?: string | null } = {},
): Promise<{ participantId: string; allocationId: string; sessionId: string }> {
  const p = await one<{ id: string }>(pool, "INSERT INTO participants (study_id, code) VALUES ($1, $2) RETURNING id", [studyId, code]);
  if (opts.consent !== false) await recordConsent(pool, p.id);
  const a = await one<{ id: string }>(
    pool,
    `INSERT INTO allocations (study_id, participant_id, condition_id, algorithm, seed, sequence_index, study_protocol_version, content_set_code)
     VALUES ($1, $2, $3, 'block', 'seed-1', $4, 'p1', $5) RETURNING id`,
    [studyId, p.id, conditionId, sequenceIndex, opts.contentSetCode ?? null],
  );
  const s = await one<{ id: string }>(
    pool,
    `INSERT INTO study_sessions (study_id, participant_id, condition_id, allocation_id, app_build, status, started_at)
     VALUES ($1, $2, $3, $4, 'test-build', 'in_progress', now()) RETURNING id`,
    [studyId, p.id, conditionId, a.id],
  );
  return { participantId: p.id, allocationId: a.id, sessionId: s.id };
}
