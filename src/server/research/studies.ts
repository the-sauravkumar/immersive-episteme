/**
 * Study configuration service (research console): create, configure, version, activate, close.
 *
 * - Configuration is protocol-as-data in `studies.config` (studyConfigSchema from the study
 *   contracts, eligibility included). Every change writes an append-only audit_log row with
 *   the before and after state, which is the study's configuration history.
 * - Versioning: an active or closed study is frozen by the database; a protocol change is made
 *   by `newStudyVersion`, which clones the study (conditions, battery, config, pins) into a new
 *   draft with a new protocol version and slug.
 * - Activation is guarded twice: here, a freshly generated parity report must pass (no critical
 *   failure) and is stored with the decision; in the database (migration 0005), the snapshot must
 *   be published, the manifest published and compiled from it, the battery locked, etc.
 */
import { z } from "zod";

import { studyConfigSchema } from "@/features/study/contracts";
import { NEW_STUDY_CONFIG } from "@/server/study/config";
import { slugSchema } from "@/lib/validation/primitives";

import { parityInputHash } from "./parity/engine";
import { loadParityInput, runAndStoreParityReport } from "./parity/store";
import { audit, inTransaction, ResearchActionError, type Actor, type Q } from "./db";
import type { Pool, PoolClient } from "pg";

/** Inclusion / exclusion criteria: part of the shared study contract. */
export const eligibilitySchema = studyConfigSchema.shape.eligibility.unwrap();

/** studies.config as the console writes it (the shared study contract, eligibility included). */
export const researchStudyConfigSchema = studyConfigSchema;
/**
 * What a DRAFT may hold: as above, but traditions may still be empty while the researcher
 * configures the study (the parity report and the study engine require at least one).
 */
export const draftStudyConfigSchema = researchStudyConfigSchema.extend({ traditionSlugs: z.array(slugSchema).default([]) });
export type ResearchStudyConfig = z.infer<typeof draftStudyConfigSchema>;

export const createStudySchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  protocolVersion: z.string().trim().min(1).max(64),
  design: z.enum(["between", "within"]),
});

export const updateStudySchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable(),
  protocolVersion: z.string().trim().min(1).max(64),
  design: z.enum(["between", "within"]),
  snapshotId: z.uuid().nullable(),
  manifestId: z.uuid().nullable(),
  config: draftStudyConfigSchema,
});
export type UpdateStudyInput = z.infer<typeof updateStudySchema>;

export const batteryItemSchema = z.object({
  assessmentId: z.uuid(),
  phase: z.enum(["pre", "learning", "post", "follow_up"]),
  position: z.number().int().min(0).max(99),
  required: z.boolean().default(true),
});

export interface StudySummary {
  id: string;
  slug: string;
  title: string;
  status: string;
  protocolVersion: string;
  design: string;
  isDemo: boolean;
  participants: number;
  sessions: number;
  updatedAt: string;
}

export async function listStudies(q: Q): Promise<StudySummary[]> {
  const r = await q.query<StudySummary>(
    `SELECT s.id, s.slug, s.title, s.status::text AS status, s.protocol_version AS "protocolVersion", s.design::text AS design,
            s.is_demo AS "isDemo",
            (SELECT count(*)::int FROM participants p WHERE p.study_id = s.id) AS participants,
            (SELECT count(*)::int FROM study_sessions ss WHERE ss.study_id = s.id) AS sessions,
            to_json(s.updated_at)#>>'{}' AS "updatedAt"
       FROM studies s ORDER BY s.is_demo, s.created_at DESC`,
  );
  return r.rows;
}

export interface StudyDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  protocolVersion: string;
  design: string;
  isDemo: boolean;
  snapshotId: string | null;
  manifestId: string | null;
  config: ResearchStudyConfig;
  configIssues: string[];
  activatedAt: string | null;
  closedAt: string | null;
  conditions: { id: string; code: string; label: string; interface: string }[];
  battery: { assessmentId: string; code: string; version: number; title: string; kind: string; status: string; phase: string; position: number; required: boolean }[];
}

export async function getStudy(q: Q, studyId: string): Promise<StudyDetail | null> {
  const r = await q.query<Record<string, unknown>>(
    `SELECT id, slug, title, description, status::text AS status, protocol_version, design::text AS design, is_demo,
            snapshot_id, manifest_id, config, to_json(activated_at)#>>'{}' AS activated_at, to_json(closed_at)#>>'{}' AS closed_at
       FROM studies WHERE id = $1`,
    [studyId],
  );
  const s = r.rows[0];
  if (!s) return null;
  const parsed = draftStudyConfigSchema.safeParse(s.config ?? {});
  const [conds, battery] = await Promise.all([
    q.query<StudyDetail["conditions"][number]>("SELECT id, code, label, interface::text AS interface FROM study_conditions WHERE study_id = $1 ORDER BY position, code", [studyId]),
    q.query<StudyDetail["battery"][number]>(
      `SELECT sa.assessment_id AS "assessmentId", a.code, a.version, a.title, a.kind::text AS kind, a.status::text AS status,
              sa.phase::text AS phase, sa.position, sa.required
         FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id WHERE sa.study_id = $1
        ORDER BY array_position(ARRAY['pre','learning','post','follow_up'], sa.phase::text), sa.position`,
      [studyId],
    ),
  ]);
  return {
    id: String(s.id),
    slug: String(s.slug),
    title: String(s.title),
    description: (s.description as string | null) ?? null,
    status: String(s.status),
    protocolVersion: String(s.protocol_version),
    design: String(s.design),
    isDemo: Boolean(s.is_demo),
    snapshotId: (s.snapshot_id as string | null) ?? null,
    manifestId: (s.manifest_id as string | null) ?? null,
    config: parsed.success ? parsed.data : draftStudyConfigSchema.parse({}),
    configIssues: parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    activatedAt: (s.activated_at as string | null) ?? null,
    closedAt: (s.closed_at as string | null) ?? null,
    conditions: conds.rows,
    battery: battery.rows,
  };
}

async function requireDraft(q: Q, studyId: string): Promise<Record<string, unknown>> {
  const r = await q.query<Record<string, unknown>>("SELECT * FROM studies WHERE id = $1 FOR UPDATE", [studyId]);
  const row = r.rows[0];
  if (!row) throw new ResearchActionError("Study not found");
  if (row.status !== "draft") throw new ResearchActionError(`The study is ${String(row.status)}; its protocol is frozen. Create a new version to change it.`);
  return row;
}

/** Creates a draft study with its two conditions (2D and 3D, equal allocation weight). */
export async function createStudy(pool: Pool | PoolClient, actor: Actor, input: z.infer<typeof createStudySchema>): Promise<string> {
  const data = createStudySchema.parse(input);
  if (data.slug.startsWith("demo")) throw new ResearchActionError("Slugs starting with 'demo' are reserved for demo studies.");
  // Adopted study decisions for new studies (D3 allocation after the pre-test, D5 30-minute fixed
  // learning phase, D7/D8 questionnaires and order): src/server/study/config.ts NEW_STUDY_CONFIG.
  const config = draftStudyConfigSchema.parse(NEW_STUDY_CONFIG);
  return inTransaction(pool, async (c) => {
    const s = await c.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
      [data.slug, data.title, data.description ?? null, data.protocolVersion, data.design, JSON.stringify(config), actor.userId],
    );
    const id = s.rows[0]!.id;
    await c.query(
      `INSERT INTO study_conditions (study_id, code, label, interface, position) VALUES
         ($1, 'conventional', 'Conventional 2D', 'conventional_2d', 0),
         ($1, 'immersive', 'Immersive 3D', 'immersive_3d', 1)`,
      [id],
    );
    await audit(c, actor, "study.create", "study", id, { after: { ...data, config } });
    return id;
  });
}

export async function updateStudy(pool: Pool | PoolClient, actor: Actor, studyId: string, input: UpdateStudyInput): Promise<void> {
  const data = updateStudySchema.parse(input);
  if (data.design === "within" && Object.keys(data.config.contentSets ?? {}).length < 2) {
    throw new ResearchActionError("A within-subjects study needs at least two matched content sets.");
  }
  await inTransaction(pool, async (c) => {
    const before = await requireDraft(c, studyId);
    await c.query(
      `UPDATE studies SET title = $2, description = $3, protocol_version = $4, design = $5, snapshot_id = $6, manifest_id = $7, config = $8::jsonb
        WHERE id = $1`,
      [studyId, data.title, data.description, data.protocolVersion, data.design, data.snapshotId, data.manifestId, JSON.stringify(data.config)],
    );
    await audit(c, actor, "study.configure", "study", studyId, {
      before: pickProtocol(before),
      after: { title: data.title, description: data.description, protocol_version: data.protocolVersion, design: data.design, snapshot_id: data.snapshotId, manifest_id: data.manifestId, config: data.config },
    });
  });
}

function pickProtocol(row: Record<string, unknown>) {
  return { title: row.title, description: row.description, protocol_version: row.protocol_version, design: row.design, snapshot_id: row.snapshot_id, manifest_id: row.manifest_id, config: row.config };
}

/** Replaces the assessment battery (order = phase then position) of a draft study. */
export async function setBattery(pool: Pool | PoolClient, actor: Actor, studyId: string, items: z.input<typeof batteryItemSchema>[]): Promise<void> {
  const rows = z.array(batteryItemSchema).max(40).parse(items);
  const seen = new Set<string>();
  for (const r of rows) {
    const k = `${r.phase}:${r.position}`;
    const a = `${r.assessmentId}:${r.phase}`;
    if (seen.has(k)) throw new ResearchActionError(`Two assessments share position ${r.position} in phase ${r.phase}.`);
    if (seen.has(a)) throw new ResearchActionError("An assessment appears twice in the same phase.");
    seen.add(k).add(a);
  }
  await inTransaction(pool, async (c) => {
    await requireDraft(c, studyId);
    const before = await c.query("SELECT assessment_id, phase::text, position, required FROM study_assessments WHERE study_id = $1 ORDER BY phase, position", [studyId]);
    await c.query("DELETE FROM study_assessments WHERE study_id = $1", [studyId]);
    for (const r of rows) {
      await c.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position, required) VALUES ($1, $2, $3, $4, $5)", [studyId, r.assessmentId, r.phase, r.position, r.required]);
    }
    await audit(c, actor, "study.battery", "study", studyId, { before: before.rows, after: rows });
  });
}

export interface ActivationResult {
  activated: boolean;
  parityReportId: string | null;
  passed: boolean;
  failures: string[];
}

/**
 * Activates a draft study. A new parity report is generated and stored in the same transaction;
 * the study is activated only when it passes, and only if the inputs the report judged are still
 * the study's (row locked). A refused activation keeps the stored report as evidence.
 */
export async function activateStudy(pool: Pool | PoolClient, actor: Actor, studyId: string): Promise<ActivationResult> {
  return inTransaction(pool, async (c) => {
    await requireDraft(c, studyId);
    const stored = await runAndStoreParityReport(c, studyId, actor);
    const failures = stored.report.checks.filter((x) => !x.passed && x.severity === "critical").map((x) => `${x.label}: ${x.issues[0]?.message ?? "failed"}${x.issues.length > 1 ? ` (+${x.issues.length - 1} more)` : ""}`);
    if (!stored.report.passed || !stored.id) {
      await audit(c, actor, "study.activation_refused", "study", studyId, { after: { parityReportId: stored.id, failures } });
      return { activated: false, parityReportId: stored.id, passed: false, failures };
    }
    const current = await loadParityInput(c, studyId);
    if (parityInputHash(current.study) !== stored.report.inputSha256) throw new ResearchActionError("The study changed while it was being checked; run the activation again.");
    await c.query("UPDATE studies SET status = 'active', activated_by = $2, activated_at = now() WHERE id = $1", [studyId, actor.userId]);
    await audit(c, actor, "study.activate", "study", studyId, { after: { status: "active", parityReportId: stored.id, parityInputSha256: stored.report.inputSha256 } });
    return { activated: true, parityReportId: stored.id, passed: true, failures: [] };
  });
}

export async function closeStudy(pool: Pool | PoolClient, actor: Actor, studyId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new ResearchActionError("Give a reason for closing the study.");
  await inTransaction(pool, async (c) => {
    const r = await c.query<{ status: string }>("SELECT status::text AS status FROM studies WHERE id = $1 FOR UPDATE", [studyId]);
    if (r.rows[0]?.status !== "active") throw new ResearchActionError("Only an active study can be closed.");
    await c.query("UPDATE studies SET status = 'closed', closed_at = now() WHERE id = $1", [studyId]);
    await audit(c, actor, "study.close", "study", studyId, { after: { status: "closed" }, reason });
  });
}

/** Clones a study into a new draft protocol version (conditions, battery, config and pins). */
export async function newStudyVersion(pool: Pool | PoolClient, actor: Actor, studyId: string, input: { slug: string; protocolVersion: string }): Promise<string> {
  const slug = slugSchema.parse(input.slug);
  const protocolVersion = z.string().trim().min(1).max(64).parse(input.protocolVersion);
  return inTransaction(pool, async (c) => {
    const src = await c.query<Record<string, unknown>>("SELECT * FROM studies WHERE id = $1", [studyId]);
    const s = src.rows[0];
    if (!s) throw new ResearchActionError("Study not found");
    if (s.protocol_version === protocolVersion) throw new ResearchActionError("The new version needs a different protocol version.");
    if (Boolean(s.is_demo) !== slug.startsWith("demo")) throw new ResearchActionError(s.is_demo ? "A demo study's slug must start with 'demo'." : "Slugs starting with 'demo' are reserved for demo studies.");
    const n = await c.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, snapshot_id, manifest_id, config, allow_unverified_content, is_demo, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11) RETURNING id`,
      [slug, s.title, s.description, protocolVersion, s.design, s.snapshot_id, s.manifest_id, JSON.stringify(s.config), s.allow_unverified_content, s.is_demo, actor.userId],
    );
    const id = n.rows[0]!.id;
    await c.query(
      `INSERT INTO study_conditions (study_id, code, label, interface, allocation_weight, position, config)
       SELECT $2, code, label, interface, allocation_weight, position, config FROM study_conditions WHERE study_id = $1`,
      [studyId, id],
    );
    await c.query(
      `INSERT INTO study_assessments (study_id, assessment_id, phase, position, required)
       SELECT $2, assessment_id, phase, position, required FROM study_assessments WHERE study_id = $1`,
      [studyId, id],
    );
    await audit(c, actor, "study.version", "study", id, { after: { derivedFrom: studyId, fromProtocolVersion: s.protocol_version, protocolVersion, slug } });
    return id;
  });
}

export interface HistoryEntry {
  occurredAt: string;
  action: string;
  actorId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export async function studyHistory(q: Q, studyId: string): Promise<HistoryEntry[]> {
  const r = await q.query<HistoryEntry>(
    `SELECT to_json(occurred_at)#>>'{}' AS "occurredAt", action, actor_id AS "actorId", before, after, reason
       FROM audit_log WHERE entity = 'study' AND entity_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 100`,
    [studyId],
  );
  return r.rows;
}

/** Snapshots and manifests a draft study may pin (the parity report judges whether they are usable). */
export async function pinOptions(q: Q, isDemo: boolean) {
  const snaps = await q.query<{ id: string; versionLabel: string; status: string; kind: string; isDemo: boolean }>(
    `SELECT id, version_label AS "versionLabel", status::text AS status, kind, is_demo AS "isDemo" FROM content_snapshots
      WHERE ($1 OR (kind = 'release' AND NOT is_demo)) ORDER BY created_at DESC LIMIT 50`,
    [isDemo],
  );
  const mans = await q.query<{ id: string; snapshotId: string; status: string; traditions: string[]; compilerVersion: string }>(
    `SELECT id, snapshot_id AS "snapshotId", status::text AS status, traditions, compiler_version AS "compilerVersion"
       FROM spatial_manifests WHERE snapshot_id = ANY($1::uuid[]) ORDER BY created_at DESC`,
    [snaps.rows.map((s) => s.id)],
  );
  return { snapshots: snaps.rows, manifests: mans.rows };
}

export async function assessmentOptions(q: Q, isDemo: boolean) {
  const r = await q.query<{ id: string; code: string; version: number; kind: string; title: string; status: string }>(
    `SELECT id, code, version, kind::text AS kind, title, status::text AS status FROM assessments
      WHERE ($1 OR NOT is_demo) ORDER BY code, version DESC`,
    [isDemo],
  );
  return r.rows;
}

/** Tradition slugs in a snapshot payload (for the configuration form). */
export async function snapshotTraditions(q: Q, snapshotId: string): Promise<{ slug: string; name: string }[]> {
  const r = await q.query<{ slug: string; name: string }>(
    `SELECT t->>'slug' AS slug, t->>'name' AS name FROM content_snapshots, jsonb_array_elements(payload->'traditions') t WHERE id = $1 ORDER BY 1`,
    [snapshotId],
  );
  return r.rows;
}
