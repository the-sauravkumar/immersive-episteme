import { createHash, randomBytes } from "node:crypto";

import { z } from "zod";

import { studyConfigSchema, type StudyConfig } from "@/features/study/contracts";
import { inTransaction } from "@/server/db/transaction";
import { consentChangeIssue, DEFAULT_QUESTIONNAIRES, NEW_STUDY_CONFIG } from "@/server/study/config";
import { seedInstrumentDefinitions } from "@/server/study/instruments";
import { carriesSampleText } from "@/features/study/test-items";
import { DESIGNED_TEST_BATTERY, seedTestBattery } from "@/server/study/test-battery";
import { slugSchema } from "@/lib/validation/primitives";

import { parityInputHash } from "./parity/engine";
import { loadParityInput, runAndStoreParityReport } from "./parity/store";
import { audit, queryAll, ResearchActionError, type Actor, type Q } from "./db";
import type { Pool, PoolClient } from "pg";

export const researchStudyConfigSchema = studyConfigSchema;
export const draftStudyConfigSchema = researchStudyConfigSchema.extend({ traditionSlugs: z.array(slugSchema).default([]) });
type ResearchStudyConfig = z.infer<typeof draftStudyConfigSchema>;

export const createStudySchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  protocolVersion: z.string().trim().min(1).max(64),
});

const updateStudySchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable(),
  protocolVersion: z.string().trim().min(1).max(64),
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
  isDemo: boolean;
  participants: number;
  sessions: number;
  updatedAt: string;
}

export async function listStudies(q: Q): Promise<StudySummary[]> {
  const r = await q.query<StudySummary>(
    `SELECT s.id, s.slug, s.title, s.status::text AS status, s.protocol_version AS "protocolVersion",
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
  const [conds, battery] = await queryAll(q, [
    () => q.query<StudyDetail["conditions"][number]>("SELECT id, code, label, interface::text AS interface FROM study_conditions WHERE study_id = $1 ORDER BY position, code", [studyId]),
    () => q.query<StudyDetail["battery"][number]>(
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

export async function createStudy(pool: Pool | PoolClient, actor: Actor, input: z.infer<typeof createStudySchema>): Promise<string> {
  const data = createStudySchema.parse(input);
  if (data.slug.startsWith("demo")) throw new ResearchActionError("Slugs starting with 'demo' are reserved for demo studies.");
  const config = draftStudyConfigSchema.parse(NEW_STUDY_CONFIG);
  return inTransaction(pool, async (c) => {
    const s = await c.query<{ id: string }>(
      `INSERT INTO studies (slug, title, description, protocol_version, design, config, created_by)
       VALUES ($1, $2, $3, $4, 'between', $5::jsonb, $6) RETURNING id`,
      [data.slug, data.title, data.description ?? null, data.protocolVersion, JSON.stringify(config), actor.userId],
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
  await inTransaction(pool, async (c) => {
    const before = await requireDraft(c, studyId);
    const consentIssue = consentChangeIssue(before.config as Partial<StudyConfig> | null, data.config);
    if (consentIssue) throw new ResearchActionError(consentIssue);
    await c.query(
      `UPDATE studies SET title = $2, description = $3, protocol_version = $4, design = 'between', snapshot_id = $5, manifest_id = $6, config = $7::jsonb
        WHERE id = $1`,
      [studyId, data.title, data.description, data.protocolVersion, data.snapshotId, data.manifestId, JSON.stringify(data.config)],
    );
    await audit(c, actor, "study.configure", "study", studyId, {
      before: pickProtocol(before),
      after: { title: data.title, description: data.description, protocol_version: data.protocolVersion, design: "between", snapshot_id: data.snapshotId, manifest_id: data.manifestId, config: data.config },
    });
  });
}

function pickProtocol(row: Record<string, unknown>) {
  return { title: row.title, description: row.description, protocol_version: row.protocol_version, design: row.design, snapshot_id: row.snapshot_id, manifest_id: row.manifest_id, config: row.config };
}

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

export interface DesignedBatteryResult {
  attached: number;
  newlyLoaded: string[];
  missingInstruments: string[];
  demoOnly: string[];
}

type BatteryRow = { assessmentId: string; code: string; phase: string; position: number; required: boolean };

export async function attachDesignedBattery(pool: Pool | PoolClient, actor: Actor, studyId: string): Promise<DesignedBatteryResult> {
  return inTransaction(pool, async (c) => {
    const study = await requireDraft(c, studyId);
    const questionnaires = draftStudyConfigSchema.safeParse(study.config ?? {}).data?.questionnaires ?? DEFAULT_QUESTIONNAIRES;
    const newlyLoaded = [...(await seedInstrumentDefinitions(c)), ...(await seedTestBattery(c, DESIGNED_TEST_BATTERY)).map((code) => `${code}@1`)];
    const latest = async (code: string, kind: string, version?: number) =>
      (
        await c.query<{ id: string }>(
          "SELECT id FROM assessments WHERE code = $1 AND kind::text = $2 AND ($3::int IS NULL OR version = $3) AND NOT is_demo ORDER BY version DESC LIMIT 1",
          [code, kind, version ?? null],
        )
      ).rows[0]?.id ?? null;
    const designed: BatteryRow[] = [];
    const demoOnly = DESIGNED_TEST_BATTERY.filter(carriesSampleText).map((a) => a.code);
    for (const a of DESIGNED_TEST_BATTERY.filter((form) => !carriesSampleText(form))) {
      const id = await latest(a.code, a.kind);
      if (id) designed.push({ assessmentId: id, code: a.code, phase: a.phase, position: a.position, required: true });
    }
    const refs = new Map<string, number | undefined>();
    for (const ref of [...questionnaires.pre, ...questionnaires.postLearning, ...questionnaires.end]) {
      const r = typeof ref === "string" ? { code: ref } : ref;
      if (!refs.has(r.code)) refs.set(r.code, "version" in r ? r.version : undefined);
    }
    const instruments: { assessmentId: string; code: string }[] = [];
    const missingInstruments: string[] = [];
    for (const [code, version] of refs) {
      const id = await latest(code, "questionnaire", version);
      if (id) instruments.push({ assessmentId: id, code });
      else missingInstruments.push(version ? `${code} v${version}` : code);
    }
    const replaced = new Set([...designed.map((d) => d.code), ...instruments.map((i) => i.code)]);
    const before = await c.query<BatteryRow>(
      `SELECT sa.assessment_id AS "assessmentId", a.code, sa.phase::text AS phase, sa.position, sa.required
         FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id WHERE sa.study_id = $1 ORDER BY sa.phase, sa.position`,
      [studyId],
    );
    const rows = [...designed];
    const nextFree = (phase: string) => Math.max(-1, ...rows.filter((r) => r.phase === phase).map((r) => r.position)) + 1;
    for (const kept of before.rows.filter((r) => !replaced.has(r.code))) rows.push({ ...kept, position: nextFree(kept.phase) });
    for (const i of instruments) rows.push({ ...i, phase: "post", position: nextFree("post"), required: true });
    const items = rows.map((r) => ({ assessmentId: r.assessmentId, phase: r.phase, position: r.position, required: r.required }));
    const parsed = z.array(batteryItemSchema).max(40).parse(items);
    await c.query("DELETE FROM study_assessments WHERE study_id = $1", [studyId]);
    for (const r of parsed) {
      await c.query("INSERT INTO study_assessments (study_id, assessment_id, phase, position, required) VALUES ($1, $2, $3, $4, $5)", [studyId, r.assessmentId, r.phase, r.position, r.required]);
    }
    await audit(c, actor, "study.battery", "study", studyId, { before: before.rows, after: parsed, reason: "Designed test battery and questionnaire instruments attached" });
    return { attached: parsed.length, newlyLoaded, missingInstruments, demoOnly };
  });
}

export interface ActivationResult {
  activated: boolean;
  parityReportId: string | null;
  passed: boolean;
  failures: string[];
}

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
    const pins = activationPins(current.study.config);
    await c.query("UPDATE studies SET config = $3::jsonb, status = 'active', activated_by = $2, activated_at = now() WHERE id = $1", [studyId, actor.userId, JSON.stringify(pins.config)]);
    await audit(c, actor, "study.activate", "study", studyId, {
      after: { status: "active", parityReportId: stored.id, parityInputSha256: stored.report.inputSha256, ...pins.recorded },
    });
    return { activated: true, parityReportId: stored.id, passed: true, failures: [] };
  });
}

function activationPins(rawConfig: unknown): { config: Record<string, unknown>; recorded: Record<string, unknown> } {
  const config = { ...(rawConfig as Record<string, unknown>) };
  const allocation = { ...((config.allocation as Record<string, unknown> | undefined) ?? {}) };
  const recorded: Record<string, unknown> = {};
  if (typeof allocation.seed !== "string" || allocation.seed.length === 0) {
    allocation.seed = randomBytes(32).toString("base64url");
    recorded.allocationSeed = { generated: true, sha256Prefix: createHash("sha256").update(allocation.seed as string, "utf8").digest("hex").slice(0, 12) };
  }
  config.allocation = allocation;
  return { config, recorded };
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

function withoutActivationPins(raw: unknown): unknown {
  const config = { ...((raw as Record<string, unknown>) ?? {}) };
  const allocation = { ...((config.allocation as Record<string, unknown> | undefined) ?? {}) };
  delete allocation.seed;
  config.allocation = allocation;
  return config;
}

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
      [slug, s.title, s.description, protocolVersion, s.design, s.snapshot_id, s.manifest_id, JSON.stringify(withoutActivationPins(s.config)), s.allow_unverified_content, s.is_demo, actor.userId],
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

export async function pinOptions(q: Q, isDemo: boolean) {
  const snaps = await q.query<{ id: string; versionLabel: string; status: string; kind: string; isDemo: boolean }>(
    `SELECT id, version_label AS "versionLabel", status::text AS status, kind, is_demo AS "isDemo" FROM content_snapshots
      WHERE ($1 OR (kind = 'release' AND NOT is_demo)) ORDER BY created_at DESC LIMIT 50`,
    [isDemo],
  );
  return { snapshots: snaps.rows };
}

export async function assessmentOptions(q: Q, isDemo: boolean) {
  const r = await q.query<{ id: string; code: string; version: number; kind: string; title: string; status: string }>(
    `SELECT id, code, version, kind::text AS kind, title, status::text AS status FROM assessments
      WHERE ($1 OR NOT is_demo) ORDER BY code, version DESC`,
    [isDemo],
  );
  return r.rows;
}

export async function snapshotTraditions(q: Q, snapshotId: string): Promise<{ slug: string; name: string }[]> {
  const r = await q.query<{ slug: string; name: string }>(
    `SELECT t->>'slug' AS slug, t->>'name' AS name FROM content_snapshots, jsonb_array_elements(payload->'traditions') t WHERE id = $1 ORDER BY 1`,
    [snapshotId],
  );
  return r.rows;
}
