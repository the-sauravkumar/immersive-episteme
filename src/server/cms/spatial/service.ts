/**
 * Spatial studio services (/cms/spatial): compile manifests from stored snapshots, record and
 * revoke manual overrides, compile with overrides, and publish a manifest for study use.
 *
 * Overrides are versioned through the rule set they belong to (manual_overrides.rule_set_id):
 *   base manifest M (rule set B, frozen)
 *     -> overrides recorded on a DRAFT rule set D = `${B.name}+overrides` v(n+1) (B's config;
 *        the still-active overrides of the previous frozen version are carried over with their
 *        original author, reason and time)
 *     -> "compile with overrides" FREEZES D (overrides freeze with it, migration 0003
 *        ie_manual_overrides_guard), compiles M's snapshot + traditions + seed with D, applies
 *        the active overrides, re-validates the edited manifest and stores it (rule_set_id = D).
 * So every manifest names the exact, immutable rule-set version (config + overrides) it came from.
 *
 * Every mutation re-checks the permission (ensure), runs in one transaction with the actor set
 * for the triggers (inActorTx) and appends an audit_log row. Not `server-only` (tests call it).
 */
import type { Pool, PoolClient } from "pg";

import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import {
  COMPILER_VERSION,
  compileSpatialManifest,
  manifestHashOf,
  revalidateManifest,
  SpatialCompileError,
  type CompiledElement,
  type CompiledManifest,
  type CompileInput,
  type ManifestValidation,
} from "@/features/spatial/compiler";
import { loadSnapshotPayload, SnapshotNotReadableError } from "@/server/knowledge/snapshot-store";
import { compileAndStoreManifest, exhibitAssetsForBundle, storeElementIndex, type StoredManifest } from "@/server/spatial/manifest-store";

import { audit, CmsError, ensure, inActorTx, isUuid, type Actor, type Q } from "../core";
import { applyPointer, checkOverride } from "./pointer";

export const OVERRIDES_SUFFIX = "+overrides";

export function overridesRuleSetName(baseName: string): string {
  return baseName.endsWith(OVERRIDES_SUFFIX) ? baseName : `${baseName}${OVERRIDES_SUFFIX}`;
}

interface ManifestRow {
  id: string;
  snapshot_id: string;
  rule_set_id: string;
  rule_set_name: string;
  rule_set_status: string;
  rule_set_config: unknown;
  compiler_version: string;
  seed: string;
  traditions: string[];
  status: string;
  is_demo: boolean;
  manifest: CompiledManifest;
  validation: ManifestValidation & Record<string, unknown>;
  snapshot_kind: string;
  snapshot_status: string;
  snapshot_label: string;
}

async function loadManifestRow(q: Q, manifestId: string, lock = false): Promise<ManifestRow> {
  if (!isUuid(manifestId)) throw new CmsError("not_found", "Manifest not found", 404);
  const r = await q.query<ManifestRow>(
    `SELECT m.id, m.snapshot_id, m.rule_set_id, rs.name AS rule_set_name, rs.status AS rule_set_status, rs.config AS rule_set_config,
            m.compiler_version, m.seed, m.traditions, m.status, m.is_demo, m.manifest, m.validation,
            s.kind AS snapshot_kind, s.status AS snapshot_status, s.version_label AS snapshot_label
       FROM spatial_manifests m
       JOIN mapping_rule_sets rs ON rs.id = m.rule_set_id
       JOIN content_snapshots s ON s.id = m.snapshot_id
      WHERE m.id = $1 ${lock ? "FOR UPDATE OF m" : ""}`,
    [manifestId],
  );
  const row = r.rows[0];
  if (!row) throw new CmsError("not_found", "Manifest not found", 404);
  if (row.is_demo) throw new CmsError("demo_manifest", "Demo manifests are managed by the demo seed, not the studio", 409);
  return row;
}


async function readPayload(q: Q, snapshotId: string): Promise<KnowledgeBundle> {
  try {
    return await loadSnapshotPayload(q, snapshotId);
  } catch (err) {
    if (err instanceof SnapshotNotReadableError) throw new CmsError("snapshot_unreadable", `Snapshot cannot be read (${err.message})`, 422);
    throw err;
  }
}

function compileError(err: unknown): unknown {
  if (err instanceof CmsError) return err;
  if (err instanceof SpatialCompileError) return new CmsError("compile_failed", err.message, 422);
  if (err instanceof Error && !("code" in err)) return new CmsError("compile_failed", err.message, 422);
  return err;
}

// =========================================================================================
// Compile
// =========================================================================================

export interface CompileRequest {
  snapshotId: string;
  traditions: string[];
  seed: string;
}

/** Plain compile with the default frozen rule set (src/server/spatial/manifest-store.ts). */
export async function compileManifest(pool: Pool, actor: Actor, input: CompileRequest): Promise<StoredManifest> {
  ensure(actor, "spatial.compile");
  if (!isUuid(input.snapshotId)) throw new CmsError("not_found", "Snapshot not found", 404);
  const snap = await pool.query<{ kind: string; status: string; is_demo: boolean }>("SELECT kind, status, is_demo FROM content_snapshots WHERE id = $1", [input.snapshotId]);
  const s = snap.rows[0];
  if (!s) throw new CmsError("not_found", "Snapshot not found", 404);
  if (s.is_demo) throw new CmsError("demo_snapshot", "Demo snapshots are compiled by the demo seed", 409);
  if (s.kind === "release" && s.status !== "published") throw new CmsError("snapshot_draft", "A draft release snapshot cannot be compiled; publish it first", 409);

  const client = await pool.connect();
  let stored: StoredManifest;
  try {
    stored = await compileAndStoreManifest(client, { snapshotId: input.snapshotId, traditions: input.traditions, seed: input.seed, createdBy: actor.userId });
  } catch (err) {
    throw compileError(err);
  } finally {
    client.release();
  }
  await inActorTx(pool, actor, null, (c) =>
    audit(c, actor, {
      action: "spatial.compile_requested",
      entity: "spatial_manifests",
      entityId: stored.id,
      after: { snapshotId: input.snapshotId, traditions: stored.traditions, seed: stored.seed, created: stored.created, status: stored.status, manifestHash: stored.manifestHash },
    }),
  );
  return stored;
}

// =========================================================================================
// Overrides
// =========================================================================================

interface RuleSetRow {
  id: string;
  name: string;
  version: number;
  status: string;
  config: unknown;
}

/** The draft overrides rule set for this manifest's lineage, created (with carry-over) if missing. */
async function ensureDraftRuleSet(c: PoolClient, actor: Actor, m: ManifestRow): Promise<{ draft: RuleSetRow; created: boolean }> {
  const name = overridesRuleSetName(m.rule_set_name);
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`spatial-overrides:${name}`]);
  const existing = await c.query<RuleSetRow>("SELECT id, name, version, status, config FROM mapping_rule_sets WHERE name = $1 AND status = 'draft' ORDER BY version DESC LIMIT 1", [name]);
  if (existing.rows[0]) return { draft: existing.rows[0], created: false };

  const prev = await c.query<RuleSetRow>("SELECT id, name, version, status, config FROM mapping_rule_sets WHERE name = $1 ORDER BY version DESC LIMIT 1", [name]);
  const previous = prev.rows[0] ?? null;
  const config = previous?.config ?? m.rule_set_config;
  const ins = await c.query<RuleSetRow>(
    `INSERT INTO mapping_rule_sets (name, version, description, config, status, is_demo, created_by)
     VALUES ($1, $2, $3, $4::jsonb, 'draft', false, $5) RETURNING id, name, version, status, config`,
    [
      name,
      (previous?.version ?? 0) + 1,
      `Manual-override version of ${m.rule_set_name.replace(OVERRIDES_SUFFIX, "")}: same rules, plus the audited overrides recorded on this version.`,
      JSON.stringify(config),
      actor.userId,
    ],
  );
  const draft = ins.rows[0]!;
  let carried: { from: string; to: string }[] = [];
  if (previous) {
    const r = await c.query<{ from_id: string; to_id: string }>(
      `WITH src AS (
         SELECT id, target_element_id, target_concept_id, field, value, reason, created_by, created_at
           FROM manual_overrides WHERE rule_set_id = $1 AND revoked_at IS NULL ORDER BY created_at, id
       ), ins AS (
         INSERT INTO manual_overrides (rule_set_id, target_element_id, target_concept_id, field, value, reason, is_demo, created_by, created_at)
         SELECT $2, target_element_id, target_concept_id, field, value, reason, false, created_by, created_at FROM src
         RETURNING id, target_element_id, field, value, reason, created_by, created_at
       )
       SELECT src.id AS from_id, ins.id AS to_id FROM src JOIN ins
         ON ins.target_element_id = src.target_element_id AND ins.field = src.field AND ins.value = src.value
        AND ins.reason = src.reason AND ins.created_by = src.created_by AND ins.created_at = src.created_at`,
      [previous.id, draft.id],
    );
    carried = r.rows.map((x) => ({ from: x.from_id, to: x.to_id }));
  }
  await audit(c, actor, {
    action: "spatial.rule_set_draft_created",
    entity: "mapping_rule_sets",
    entityId: draft.id,
    after: { name, version: draft.version, previousVersionId: previous?.id ?? null, baseRuleSetId: m.rule_set_id, carriedOverrides: carried },
    reason: "new override version (previous version frozen or none)",
  });
  return { draft, created: true };
}

export interface CreateOverrideRequest {
  manifestId: string;
  targetElementId: string;
  field: string;
  value: unknown;
  reason: string;
}

export async function createOverride(pool: Pool, actor: Actor, input: CreateOverrideRequest): Promise<{ overrideId: string; ruleSetId: string; version: number }> {
  ensure(actor, "spatial.override");
  return inActorTx(pool, actor, input.reason, async (c) => {
    const m = await loadManifestRow(c, input.manifestId);
    const el = m.manifest.elements.find((e) => e.id === input.targetElementId);
    if (!el) throw new CmsError("unknown_element", `Element ${input.targetElementId} is not in this manifest`, 422);
    const check = checkOverride(el, input.field, input.value);
    if (!check.ok) throw new CmsError("forbidden_pointer", check.reason, 422);
    const { draft } = await ensureDraftRuleSet(c, actor, m);
    const r = await c.query<{ id: string }>(
      `INSERT INTO manual_overrides (rule_set_id, target_element_id, target_concept_id, field, value, reason, is_demo, created_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, $7) RETURNING id`,
      [draft.id, el.id, el.conceptId, input.field, JSON.stringify(input.value), input.reason, actor.userId],
    );
    const id = r.rows[0]!.id;
    await audit(c, actor, {
      action: "spatial.override_created",
      entity: "manual_overrides",
      entityId: id,
      before: { field: input.field, value: check.before },
      after: { ruleSetId: draft.id, ruleSetVersion: draft.version, baseManifestId: m.id, targetElementId: el.id, field: input.field, value: input.value },
      reason: input.reason,
    });
    return { overrideId: id, ruleSetId: draft.id, version: draft.version };
  });
}

export async function revokeOverride(pool: Pool, actor: Actor, input: { overrideId: string; reason: string }): Promise<void> {
  ensure(actor, "spatial.override");
  if (!isUuid(input.overrideId)) throw new CmsError("not_found", "Override not found", 404);
  await inActorTx(pool, actor, input.reason, async (c) => {
    const r = await c.query<{ id: string; status: string; revoked_at: Date | null; target_element_id: string; field: string; value: unknown }>(
      `SELECT o.id, rs.status, o.revoked_at, o.target_element_id, o.field, o.value
         FROM manual_overrides o JOIN mapping_rule_sets rs ON rs.id = o.rule_set_id WHERE o.id = $1 FOR UPDATE OF o`,
      [input.overrideId],
    );
    const o = r.rows[0];
    if (!o) throw new CmsError("not_found", "Override not found", 404);
    if (o.revoked_at) throw new CmsError("already_revoked", "This override is already revoked", 409);
    if (o.status !== "draft") {
      throw new CmsError("rule_set_frozen", "This override belongs to a frozen rule-set version; revoke its copy in the current draft version (record any new override to open one)", 409);
    }
    await c.query("UPDATE manual_overrides SET revoked_by = $2, revoked_at = now(), revoke_reason = $3 WHERE id = $1", [o.id, actor.userId, input.reason]);
    await audit(c, actor, {
      action: "spatial.override_revoked",
      entity: "manual_overrides",
      entityId: o.id,
      before: { targetElementId: o.target_element_id, field: o.field, value: o.value },
      reason: input.reason,
    });
  });
}

// =========================================================================================
// Compile with overrides
// =========================================================================================

export interface AppliedOverride {
  id: string;
  elementId: string;
  field: string;
  before: unknown;
  after: unknown;
  reason: string;
}

/** Applies active overrides to a compiled manifest (pure). Not-applicable ones are reported, never guessed. */
export function applyOverrides(
  manifest: CompiledManifest,
  overrides: readonly { id: string; target_element_id: string; field: string; value: unknown; reason: string }[],
): { manifest: CompiledManifest; applied: AppliedOverride[]; skipped: { id: string; elementId: string; field: string; reason: string }[] } {
  const elements = [...manifest.elements];
  const index = new Map(elements.map((e, i) => [e.id, i]));
  const applied: AppliedOverride[] = [];
  const skipped: { id: string; elementId: string; field: string; reason: string }[] = [];
  for (const o of overrides) {
    const i = index.get(o.target_element_id);
    if (i === undefined) {
      skipped.push({ id: o.id, elementId: o.target_element_id, field: o.field, reason: "element not in this manifest" });
      continue;
    }
    const check = checkOverride(elements[i]!, o.field, o.value);
    if (!check.ok) {
      skipped.push({ id: o.id, elementId: o.target_element_id, field: o.field, reason: check.reason });
      continue;
    }
    elements[i] = applyPointer(elements[i]! as CompiledElement & Record<string, unknown>, check.segments, o.value);
    applied.push({ id: o.id, elementId: o.target_element_id, field: o.field, before: check.before, after: o.value, reason: o.reason });
  }
  return { manifest: { ...manifest, elements }, applied, skipped };
}

export interface OverrideCompileResult {
  manifestId: string;
  ruleSetId: string;
  ruleSetVersion: number;
  status: string;
  passed: boolean;
  applied: number;
  skipped: number;
  created: boolean;
}

export async function compileWithOverrides(pool: Pool, actor: Actor, input: { manifestId: string }): Promise<OverrideCompileResult> {
  ensure(actor, "spatial.compile");
  ensure(actor, "spatial.override");
  try {
    return await inActorTx(pool, actor, "compile with manual overrides", async (c) => {
      const base = await loadManifestRow(c, input.manifestId);
      const name = overridesRuleSetName(base.rule_set_name);
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`spatial-overrides:${name}`]);

      let rs = (await c.query<RuleSetRow>("SELECT id, name, version, status, config FROM mapping_rule_sets WHERE name = $1 ORDER BY version DESC LIMIT 1", [name])).rows[0];
      if (!rs) throw new CmsError("no_overrides", "No override has been recorded for this manifest's rule set", 409);
      if (rs.status === "draft") {
        const n = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM manual_overrides WHERE rule_set_id = $1", [rs.id]);
        await c.query("UPDATE mapping_rule_sets SET status = 'frozen', frozen_by = $2 WHERE id = $1", [rs.id, actor.userId]);
        await audit(c, actor, {
          action: "spatial.rule_set_frozen",
          entity: "mapping_rule_sets",
          entityId: rs.id,
          after: { name: rs.name, version: rs.version, overrides: n.rows[0]!.n },
          reason: "frozen to compile a manifest with its overrides",
        });
        rs = { ...rs, status: "frozen" };
      }

      const existing = await c.query<{ id: string; status: string; validation: { passed?: boolean; overrides?: unknown[]; skippedOverrides?: unknown[] } }>(
        `SELECT id, status, validation FROM spatial_manifests
          WHERE snapshot_id = $1 AND rule_set_id = $2 AND compiler_version = $3 AND seed = $4 AND traditions = $5::text[]`,
        [base.snapshot_id, rs.id, COMPILER_VERSION, base.seed, base.traditions],
      );
      if (existing.rows[0]) {
        const e = existing.rows[0];
        return {
          manifestId: e.id, ruleSetId: rs.id, ruleSetVersion: rs.version, status: e.status, passed: e.validation.passed === true,
          applied: e.validation.overrides?.length ?? 0, skipped: e.validation.skippedOverrides?.length ?? 0, created: false,
        };
      }

      const bundle = await readPayload(c, base.snapshot_id);
      const assets = await exhibitAssetsForBundle(c, bundle);
      const compileInput: CompileInput = {
        graph: bundle,
        snapshotVersion: bundle.versionLabel,
        traditions: base.traditions,
        ruleSet: { id: rs.id, name: rs.name, version: rs.version, config: rs.config },
        seed: base.seed,
        assets,
      };
      const compiled = compileSpatialManifest(compileInput);
      const ov = await c.query<{ id: string; target_element_id: string; field: string; value: unknown; reason: string }>(
        "SELECT id, target_element_id, field, value, reason FROM manual_overrides WHERE rule_set_id = $1 AND revoked_at IS NULL ORDER BY created_at, id",
        [rs.id],
      );
      const { manifest, applied, skipped } = applyOverrides(compiled.manifest, ov.rows);
      const revalidation = revalidateManifest(compileInput, manifest);
      const validation = {
        ...revalidation,
        compilerManifestHash: manifestHashOf(manifest),
        unmodifiedCompilerManifestHash: compiled.manifestHash,
        assets: assets.length,
        baseManifestId: base.id,
        overrides: applied,
        skippedOverrides: skipped,
      };
      const ins = await c.query<{ id: string; status: string; manifest_hash: string }>(
        `INSERT INTO spatial_manifests (snapshot_id, rule_set_id, compiler_version, seed, traditions, manifest, validation, status, is_demo, created_by)
         VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7::jsonb, $8, false, $9) RETURNING id, status, manifest_hash`,
        [base.snapshot_id, rs.id, manifest.compilerVersion, base.seed, base.traditions, JSON.stringify(manifest), JSON.stringify(validation), revalidation.passed ? "valid" : "invalid", actor.userId],
      );
      const row = ins.rows[0]!;
      const idx = await storeElementIndex(c, row.id, manifest);
      await audit(c, actor, {
        action: "spatial.manifest_compiled_with_overrides",
        entity: "spatial_manifests",
        entityId: row.id,
        after: {
          baseManifestId: base.id, snapshotId: base.snapshot_id, ruleSetId: rs.id, ruleSetName: rs.name, ruleSetVersion: rs.version, seed: base.seed,
          traditions: base.traditions, manifestHash: row.manifest_hash, passed: revalidation.passed, applied: applied.map((a) => a.id), skipped, ...idx,
        },
      });
      return { manifestId: row.id, ruleSetId: rs.id, ruleSetVersion: rs.version, status: row.status, passed: revalidation.passed, applied: applied.length, skipped: skipped.length, created: true };
    });
  } catch (err) {
    throw compileError(err);
  }
}

// =========================================================================================
// Publish
// =========================================================================================

function failingChecks(v: ManifestValidation | null | undefined): string[] {
  return (v?.checks ?? []).filter((ch) => !ch.passed && ch.details?.severity !== "warning").map((ch) => ch.id);
}

export async function publishManifest(pool: Pool, actor: Actor, input: { manifestId: string; supersede: boolean; reason?: string | null }): Promise<{ superseded: string[] }> {
  ensure(actor, "spatial.publish");
  try {
    return await inActorTx(pool, actor, input.reason ?? null, async (c) => {
      const m = await loadManifestRow(c, input.manifestId, true);
      if (m.status === "published" || m.status === "superseded") throw new CmsError("already_published", `Manifest is already ${m.status}`, 409);
      if (m.status !== "valid" || m.validation?.passed !== true) {
        throw new CmsError("validation_failed", `Only a manifest whose validation passed can be published. Failing checks: ${failingChecks(m.validation).join(", ") || m.status}`, 422, failingChecks(m.validation).map((id) => ({ code: id, message: "check failed" })));
      }
      if (m.snapshot_kind !== "release" || m.snapshot_status !== "published") {
        throw new CmsError("snapshot_not_published", `Snapshot ${m.snapshot_label} is a ${m.snapshot_kind} snapshot (${m.snapshot_status}); only manifests from a published release snapshot can be used in a study`, 422);
      }
      if (m.rule_set_status !== "frozen") throw new CmsError("rule_set_not_frozen", "The manifest's rule set is not frozen", 422);

      const bundle = await readPayload(c, m.snapshot_id);
      const assets = await exhibitAssetsForBundle(c, bundle);
      const fresh = revalidateManifest(
        { graph: bundle, snapshotVersion: bundle.versionLabel, traditions: m.traditions, ruleSet: { id: m.rule_set_id, name: m.rule_set_name, version: m.manifest.ruleSet.version, config: m.rule_set_config }, seed: m.seed, assets },
        m.manifest,
      );
      if (!fresh.passed) {
        const ids = failingChecks(fresh);
        throw new CmsError("revalidation_failed", `Fresh revalidation failed: ${ids.join(", ")}`, 422, ids.map((id) => ({ code: id, message: "check failed on revalidation" })));
      }

      let superseded: string[] = [];
      if (input.supersede) {
        const r = await c.query<{ id: string }>(
          `UPDATE spatial_manifests SET status = 'superseded'
            WHERE status = 'published' AND snapshot_id = $1 AND traditions = $2::text[] AND id <> $3 RETURNING id`,
          [m.snapshot_id, m.traditions, m.id],
        );
        superseded = r.rows.map((x) => x.id);
      }
      await c.query("UPDATE spatial_manifests SET status = 'published', published_by = $2, published_at = now() WHERE id = $1", [m.id, actor.userId]);
      await audit(c, actor, {
        action: "spatial.manifest_published",
        entity: "spatial_manifests",
        entityId: m.id,
        before: { status: m.status },
        after: { status: "published", snapshotId: m.snapshot_id, snapshotLabel: m.snapshot_label, ruleSetId: m.rule_set_id, traditions: m.traditions, freshRevalidationPassed: true, superseded },
        reason: input.reason ?? null,
      });
      return { superseded };
    });
  } catch (err) {
    throw compileError(err);
  }
}
