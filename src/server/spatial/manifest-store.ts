/**
 * Spatial manifest persistence: compile a manifest from a stored snapshot and keep it in
 * `spatial_manifests` with its traceability index (`spatial_elements`,
 * `spatial_element_encodings`).
 *
 *   manifest = compile(snapshot payload, rule set config, COMPILER_VERSION, seed, traditions)
 *
 * The inputs are the uniqueness key of `spatial_manifests` (snapshot, rule set, compiler
 * version, seed, traditions), so compiling the same inputs twice returns the existing row.
 * `manifest_hash` is the database's sha256 of the manifest jsonb (ie_jsonb_sha256); the
 * compiler's own canonical hash is kept in `validation.compilerManifestHash`.
 *
 * Status: `valid` when the compiler's validation passed, `invalid` otherwise. Publishing a
 * manifest (needs a published snapshot and a frozen rule set) is a separate, curated step; a
 * manifest compiled from a review snapshot can never be published.
 *
 * Exhibit assets come from `media_candidates` (licence not yet reviewed) depicting concepts of
 * the snapshot; they are frozen into the manifest, so the manifest stays reproducible.
 *
 * Not `server-only`: used by scripts/spatial/publish-manifest.ts and integration tests.
 */
import type { Pool, PoolClient } from "pg";

import {
  COMPILER_VERSION,
  DEFAULT_RULE_SET,
  compileSpatialManifest,
  defaultRuleSetConfig,
  ruleSetUuid,
  type CompiledManifest,
  type ExhibitAsset,
  type ManifestValidation,
} from "@/features/spatial/compiler";

import { loadSnapshotPayload } from "../knowledge/snapshot-store";

type Q = Pick<Pool | PoolClient, "query">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RuleSetRef {
  id: string;
  name: string;
  version: number;
  config: unknown;
  configSha256: string;
}

/**
 * The default mapping rule set (src/features/spatial/compiler/config.ts) as a FROZEN
 * `mapping_rule_sets` row, created once. If a row with the same name and version exists with a
 * different config, this throws: bump DEFAULT_RULE_SET.version instead of editing a rule set.
 */
export async function ensureDefaultRuleSet(q: Q): Promise<RuleSetRef> {
  const config = defaultRuleSetConfig();
  await q.query(
    `INSERT INTO mapping_rule_sets (id, name, version, description, config, status, frozen_at, is_demo)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'frozen', now(), false)
     ON CONFLICT (name, version) DO NOTHING`,
    [ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version, "Default knowledge-to-space mapping rules (spatial compiler).", JSON.stringify(config)],
  );
  const r = await q.query<{ id: string; config: unknown; config_sha256: string; same: boolean }>(
    "SELECT id, config, config_sha256, config = $3::jsonb AS same FROM mapping_rule_sets WHERE name = $1 AND version = $2",
    [DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version, JSON.stringify(config)],
  );
  const row = r.rows[0]!;
  if (!row.same) {
    throw new Error(`Rule set ${DEFAULT_RULE_SET.name} v${DEFAULT_RULE_SET.version} exists with a different config; bump DEFAULT_RULE_SET.version`);
  }
  return { id: row.id, name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config: row.config, configSha256: row.config_sha256 };
}

async function assetsForSnapshot(q: Q, conceptIds: readonly string[]): Promise<ExhibitAsset[]> {
  const r = await q.query<{ id: string; concept_id: string; url: string; title: string; licence: string | null; width: number | null; height: number | null }>(
    `SELECT id, depicts_concept_id AS concept_id, url, title, licence, width, height
       FROM media_candidates
      WHERE depicts_concept_id = ANY($1::uuid[]) AND status IN ('candidate', 'approved', 'imported')
      ORDER BY id`,
    [conceptIds],
  );
  return r.rows.map((m) => ({ id: m.id, conceptId: m.concept_id, kind: "image", uri: m.url, title: m.title, licence: m.licence, width: m.width, height: m.height }));
}

export interface CompileAndStoreInput {
  snapshotId: string;
  traditions: readonly string[];
  seed?: string;
  createdBy?: string | null;
}

export interface StoredManifest {
  id: string;
  snapshotId: string;
  ruleSetId: string;
  compilerVersion: string;
  seed: string;
  traditions: string[];
  /** sha256 of the stored manifest jsonb (spatial_manifests.manifest_hash). */
  manifestHash: string;
  /** The compiler's canonical-JSON sha256 (validation.compilerManifestHash). */
  compilerManifestHash: string;
  status: string;
  validationPassed: boolean;
  elements: number;
  encodings: number;
  created: boolean;
}

/** Compiles (or finds) the manifest for these inputs and stores it with its element index. One transaction. */
export async function compileAndStoreManifest(client: PoolClient, input: CompileAndStoreInput): Promise<StoredManifest> {
  const traditions = [...new Set(input.traditions)].sort();
  const seed = input.seed ?? "default";
  if (traditions.length === 0) throw new Error("Choose at least one tradition");
  await client.query("BEGIN");
  try {
    const snap = await client.query<{ is_demo: boolean }>("SELECT is_demo FROM content_snapshots WHERE id = $1", [input.snapshotId]);
    if (!snap.rows[0]) throw new Error(`Snapshot ${input.snapshotId} not found`);
    const isDemo = snap.rows[0].is_demo;
    if (isDemo) throw new Error("Demo snapshots are compiled by the demo seed, not here");
    const ruleSet = await ensureDefaultRuleSet(client);

    const existing = await findManifest(client, { snapshotId: input.snapshotId, ruleSetId: ruleSet.id, seed, traditions });
    if (existing) {
      await client.query("COMMIT");
      return existing;
    }

    const bundle = await loadSnapshotPayload(client, input.snapshotId);
    const missing = traditions.filter((t) => !bundle.traditions.some((x) => x.slug === t));
    if (missing.length > 0) throw new Error(`Snapshot ${bundle.versionLabel} has no tradition(s) ${missing.join(", ")}`);
    const assets = await assetsForSnapshot(client, bundle.concepts.map((c) => c.id));
    const result = compileSpatialManifest({
      graph: bundle,
      snapshotVersion: bundle.versionLabel,
      traditions,
      ruleSet: { id: ruleSet.id, name: ruleSet.name, version: ruleSet.version, config: ruleSet.config },
      seed,
      assets,
    });
    const validation = { ...result.validation, compilerManifestHash: result.manifestHash, assets: assets.length };
    const ins = await client.query<{ id: string; manifest_hash: string; status: string }>(
      `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, traditions, manifest, validation, status, is_demo, created_by)
       VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7::jsonb, $8, false, $9) RETURNING id, manifest_hash, status`,
      [input.snapshotId, ruleSet.id, result.manifest.compilerVersion, seed, traditions, JSON.stringify(result.manifest), JSON.stringify(validation), result.validation.passed ? "valid" : "invalid", input.createdBy ?? null],
    );
    const id = ins.rows[0]!.id;
    const { elements, encodings } = await storeElementIndex(client, id, result.manifest);
    await client.query(
      `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason)
       VALUES ('system', 'spatial-compiler', 'spatial.manifest_compiled', 'spatial_manifests', $1, $2::jsonb, $3)`,
      [
        id,
        JSON.stringify({ snapshotId: input.snapshotId, ruleSetId: ruleSet.id, compilerVersion: result.manifest.compilerVersion, seed, traditions, manifestHash: ins.rows[0]!.manifest_hash, compilerManifestHash: result.manifestHash, passed: result.validation.passed, coverage: result.validation.coverage }),
        "manifest compiled from a stored snapshot",
      ],
    );
    await client.query("COMMIT");
    return {
      id,
      snapshotId: input.snapshotId,
      ruleSetId: ruleSet.id,
      compilerVersion: result.manifest.compilerVersion,
      seed,
      traditions,
      manifestHash: ins.rows[0]!.manifest_hash,
      compilerManifestHash: result.manifestHash,
      status: ins.rows[0]!.status,
      validationPassed: result.validation.passed,
      elements,
      encodings,
      created: true,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

async function storeElementIndex(q: Q, manifestId: string, manifest: CompiledManifest): Promise<{ elements: number; encodings: number }> {
  const els = manifest.elements.map((e) => ({
    element_id: e.id,
    kind: e.kind,
    parent_element_id: e.parentId,
    concept_id: e.conceptId,
    rule_id: e.ruleId,
    label: e.label,
  }));
  await q.query(
    `INSERT INTO spatial_elements (manifest_id, element_id, kind, parent_element_id, concept_id, rule_id, label)
     SELECT $1, element_id, kind::spatial_element_kind, parent_element_id, concept_id, rule_id, label
       FROM jsonb_to_recordset($2::jsonb) AS x(element_id text, kind text, parent_element_id text, concept_id uuid, rule_id text, label text)`,
    [manifestId, JSON.stringify(els)],
  );
  const seen = new Set<string>();
  const encs = manifest.elements.flatMap((e) =>
    e.encodes
      .map((enc) => ({ element_id: e.id, relationship_id: enc.relationshipId, rule_id: enc.ruleId, encoding: enc.encoding }))
      .filter((x) => {
        const k = `${x.element_id}|${x.relationship_id}|${x.rule_id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }),
  );
  await q.query(
    `INSERT INTO spatial_element_encodings (manifest_id, element_id, relationship_id, rule_id, encoding)
     SELECT $1, element_id, relationship_id, rule_id, encoding
       FROM jsonb_to_recordset($2::jsonb) AS x(element_id text, relationship_id uuid, rule_id text, encoding text)`,
    [manifestId, JSON.stringify(encs)],
  );
  return { elements: els.length, encodings: encs.length };
}

async function findManifest(q: Q, k: { snapshotId: string; ruleSetId: string; seed: string; traditions: string[] }): Promise<StoredManifest | null> {
  const r = await q.query<{ id: string; compiler_version: string; manifest_hash: string; status: string; validation: { passed?: boolean; compilerManifestHash?: string }; elements: number; encodings: number }>(
    `SELECT m.id, m.compiler_version, m.manifest_hash, m.status, m.validation,
            (SELECT count(*)::int FROM spatial_elements e WHERE e.manifest_id = m.id) AS elements,
            (SELECT count(*)::int FROM spatial_element_encodings e WHERE e.manifest_id = m.id) AS encodings
       FROM spatial_manifests m
      WHERE m.snapshot_id = $1 AND m.rule_set_id = $2 AND m.compiler_version = $3 AND m.seed = $4 AND m.traditions = $5::text[]`,
    [k.snapshotId, k.ruleSetId, COMPILER_VERSION, k.seed, k.traditions],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    snapshotId: k.snapshotId,
    ruleSetId: k.ruleSetId,
    compilerVersion: row.compiler_version,
    seed: k.seed,
    traditions: k.traditions,
    manifestHash: row.manifest_hash,
    compilerManifestHash: row.validation.compilerManifestHash ?? "",
    status: row.status,
    validationPassed: row.validation.passed === true,
    elements: row.elements,
    encodings: row.encodings,
    created: false,
  };
}

export interface ManifestRecord {
  id: string;
  snapshotId: string;
  ruleSetId: string;
  compilerVersion: string;
  seed: string;
  traditions: string[];
  status: string;
  isDemo: boolean;
  manifestHash: string;
  manifest: CompiledManifest;
  validation: ManifestValidation & { compilerManifestHash?: string; assets?: number };
  createdAt: string;
}

/** A stored manifest by id, or null. */
export async function loadManifest(q: Q, manifestId: string): Promise<ManifestRecord | null> {
  if (!UUID_RE.test(manifestId)) return null;
  const r = await q.query<{
    id: string; snapshot_id: string; rule_set_id: string; compiler_version: string; seed: string; traditions: string[]; status: string; is_demo: boolean;
    manifest_hash: string; manifest: CompiledManifest; validation: ManifestRecord["validation"]; created_at: Date;
  }>("SELECT * FROM spatial_manifests WHERE id = $1", [manifestId]);
  const m = r.rows[0];
  if (!m) return null;
  return {
    id: m.id,
    snapshotId: m.snapshot_id,
    ruleSetId: m.rule_set_id,
    compilerVersion: m.compiler_version,
    seed: m.seed,
    traditions: m.traditions,
    status: m.status,
    isDemo: m.is_demo,
    manifestHash: m.manifest_hash,
    manifest: m.manifest,
    validation: m.validation,
    createdAt: m.created_at.toISOString(),
  };
}
