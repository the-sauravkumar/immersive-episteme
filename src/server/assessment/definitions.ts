/**
 * Assessment definitions: instruments (pre/post tests, transfer tasks, reconstruction, ...),
 * their items, answer keys and rubrics, and versions.
 *
 * Lifecycle: an assessment version is edited as a `draft`; publishing sets `locked`, after which
 * the database refuses any change to it or its items (migration 0003 `ie_lockable_guard` and
 * `ie_locked_parent_guard`). A change after publication is a new version: a draft copy with the
 * next version number under the same code. Rubrics are versioned and locked the same way.
 *
 * Content: every prompt, option, answer key and rubric level is typed in by a researcher. The
 * platform seeds none (demo assessments only, `is_demo`, "Demo:" titles).
 */
import type { Pool } from "pg";
import { z } from "zod";

import { answerKeySchema } from "@/features/assessment/responses";

import { scoringConfigSchema, configParameters } from "@/features/assessment/scoring";
import { assessmentCodeSchema, assessmentItemInputSchema, assessmentKindSchema } from "@/features/research/contracts";
import { DEMO_TITLE_PREFIX } from "@/lib/validation/primitives";

import { AssessmentError, assertUuid, audit, inTransaction, mapDbError, type Q } from "./common";
import { parseConceptMapConfig } from "./concept-set";

export interface AssessmentSummary {
  id: string;
  code: string;
  version: number;
  kind: string;
  title: string;
  status: "draft" | "locked";
  isDemo: boolean;
  itemCount: number;
  lockedAt: Date | null;
}

export interface ItemRow {
  id: string;
  itemKey: string;
  position: number;
  kind: string;
  prompt: string;
  config: Record<string, unknown>;
  answerKey: unknown;
}

export interface RubricLevel {
  value: number;
  label: string;
  descriptor: string;
}

export interface RubricRow {
  id: string;
  itemId: string | null;
  version: number;
  method: string;
  levels: RubricLevel[];
  status: "draft" | "locked";
}

export interface AssessmentDetail extends AssessmentSummary {
  description: string | null;
  config: Record<string, unknown>;
  instrumentName: string | null;
  instrumentCitation: string | null;
  isValidatedInstrument: boolean;
  items: ItemRow[];
  rubrics: RubricRow[];
  versions: Array<{ id: string; version: number; status: string }>;
}

type AssessmentDbRow = {
  id: string;
  code: string;
  version: number;
  kind: string;
  title: string;
  status: "draft" | "locked";
  is_demo: boolean;
  item_count: string;
  locked_at: Date | null;
};

const summary = (r: AssessmentDbRow): AssessmentSummary => ({
  id: r.id,
  code: r.code,
  version: r.version,
  kind: r.kind,
  title: r.title,
  status: r.status,
  isDemo: r.is_demo,
  itemCount: Number(r.item_count),
  lockedAt: r.locked_at,
});

export async function listAssessments(q: Q): Promise<AssessmentSummary[]> {
  const r = await q.query<AssessmentDbRow>(
    `SELECT a.id, a.code, a.version, a.kind, a.title, a.status, a.is_demo, a.locked_at,
            (SELECT count(*) FROM assessment_items i WHERE i.assessment_id = a.id) AS item_count
       FROM assessments a ORDER BY a.is_demo, a.code, a.version DESC`,
  );
  return r.rows.map(summary);
}

export const rubricLevelsSchema = z
  .array(z.object({ value: z.number().finite(), label: z.string().trim().min(1).max(120), descriptor: z.string().trim().min(1).max(2000) }))
  .min(2, "A rubric needs at least two levels")
  .max(11)
  .refine((ls) => new Set(ls.map((l) => l.value)).size === ls.length, "Level values must be distinct");

export async function getAssessment(q: Q, id: string): Promise<AssessmentDetail | null> {
  assertUuid(id, "Assessment");
  const a = await q.query<AssessmentDbRow & { description: string | null; config: Record<string, unknown>; instrument_name: string | null; instrument_citation: string | null; is_validated_instrument: boolean }>(
    `SELECT a.*, (SELECT count(*) FROM assessment_items i WHERE i.assessment_id = a.id) AS item_count FROM assessments a WHERE a.id = $1`,
    [id],
  );
  const row = a.rows[0];
  if (!row) return null;
  const items = await q.query<{ id: string; item_key: string; position: number; kind: string; prompt: string; config: Record<string, unknown>; answer_key: unknown }>(
    "SELECT id, item_key, position, kind, prompt, config, answer_key FROM assessment_items WHERE assessment_id = $1 ORDER BY position",
    [id],
  );
  const rubrics = await q.query<{ id: string; item_id: string | null; version: number; method: string; rubric: { levels?: RubricLevel[] }; status: "draft" | "locked" }>(
    "SELECT id, item_id, version, method, rubric, status FROM scoring_rubrics WHERE assessment_id = $1 ORDER BY item_id NULLS FIRST, version",
    [id],
  );
  const versions = await q.query<{ id: string; version: number; status: string }>("SELECT id, version, status FROM assessments WHERE code = $1 ORDER BY version", [row.code]);
  return {
    ...summary(row),
    description: row.description,
    config: row.config,
    instrumentName: row.instrument_name,
    instrumentCitation: row.instrument_citation,
    isValidatedInstrument: row.is_validated_instrument,
    items: items.rows.map((i) => ({ id: i.id, itemKey: i.item_key, position: i.position, kind: i.kind, prompt: i.prompt, config: i.config, answerKey: i.answer_key })),
    rubrics: rubrics.rows.map((r) => ({ id: r.id, itemId: r.item_id, version: r.version, method: r.method, levels: r.rubric.levels ?? [], status: r.status })),
    versions: versions.rows,
  };
}

async function draftAssessment(q: Q, id: string): Promise<{ id: string; kind: string; isDemo: boolean; code: string }> {
  assertUuid(id, "Assessment");
  const r = await q.query<{ id: string; kind: string; status: string; is_demo: boolean; code: string }>("SELECT id, kind, status, is_demo, code FROM assessments WHERE id = $1", [id]);
  const row = r.rows[0];
  if (!row) throw new AssessmentError("not_found", "Assessment not found");
  if (row.status === "locked") throw new AssessmentError("immutable", "A published version cannot be changed. Create a new version.");
  return { id: row.id, kind: row.kind, isDemo: row.is_demo, code: row.code };
}

export const newAssessmentSchema = z.object({
  code: assessmentCodeSchema,
  kind: assessmentKindSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional(),
  isDemo: z.boolean().default(false),
});

export async function createAssessment(q: Q, actorId: string, input: z.input<typeof newAssessmentSchema>): Promise<string> {
  const a = newAssessmentSchema.parse(input);
  const title = a.isDemo && !a.title.startsWith(DEMO_TITLE_PREFIX) ? `${DEMO_TITLE_PREFIX} ${a.title}` : a.title;
  if (a.isDemo !== a.code.startsWith("demo")) throw new AssessmentError("invalid", a.isDemo ? "Demo codes start with 'demo'." : "Only demo assessments may use a code starting with 'demo'.");
  if (!a.isDemo && title.startsWith(DEMO_TITLE_PREFIX)) throw new AssessmentError("invalid", "Only demo assessments may have a 'Demo:' title.");
  const exists = await q.query("SELECT 1 FROM assessments WHERE code = $1", [a.code]);
  if (exists.rowCount) throw new AssessmentError("conflict", "An assessment with this code exists. Create a new version of it instead.");
  const r = await q.query<{ id: string }>(
    "INSERT INTO assessments (code, version, kind, title, description, is_demo, created_by) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id",
    [a.code, a.kind, title, a.description ?? null, a.isDemo, actorId],
  );
  return r.rows[0]!.id;
}

export const assessmentMetaSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(4000).nullable(),
    instrumentName: z.string().trim().max(300).nullable(),
    instrumentCitation: z.string().trim().max(2000).nullable(),
    isValidatedInstrument: z.boolean(),
    /** Reconstruction only: concept-map scoring configuration (docs/research/concept-map-scoring.md). */
    scoring: z.unknown().optional(),
  })
  .refine((m) => !m.isValidatedInstrument || (m.instrumentName && m.instrumentCitation), {
    path: ["instrumentCitation"],
    message: "A validated instrument needs its name and citation (MP:593).",
  });

export async function updateAssessmentMeta(q: Q, id: string, input: z.input<typeof assessmentMetaSchema>): Promise<void> {
  const current = await draftAssessment(q, id);
  const m = assessmentMetaSchema.parse(input);
  if (current.isDemo && !m.title.startsWith(DEMO_TITLE_PREFIX)) throw new AssessmentError("invalid", "Demo titles start with 'Demo:'.");
  if (!current.isDemo && m.title.startsWith(DEMO_TITLE_PREFIX)) throw new AssessmentError("invalid", "Only demo assessments may have a 'Demo:' title.");
  let config: Record<string, unknown> | null = null;
  if (m.scoring !== undefined) {
    if (current.kind !== "reconstruction") throw new AssessmentError("invalid", "Only reconstruction assessments carry a concept-map scoring configuration.");
    const parsed = scoringConfigSchema.safeParse(m.scoring);
    if (!parsed.success) throw new AssessmentError("invalid", `Scoring configuration: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    config = { scoring: configParameters(parsed.data) };
  }
  try {
    await q.query(
      `UPDATE assessments SET title = $2, description = $3, instrument_name = $4, instrument_citation = $5, is_validated_instrument = $6,
              config = CASE WHEN $7::jsonb IS NULL THEN config ELSE config || $7::jsonb END, updated_at = now()
        WHERE id = $1`,
      [id, m.title, m.description || null, m.instrumentName || null, m.instrumentCitation || null, m.isValidatedInstrument, config ? JSON.stringify(config) : null],
    );
  } catch (err) {
    mapDbError(err);
  }
}

/** Item answer keys: the shared format (src/features/assessment/responses.ts). */
export const itemFormSchema = z.object({
  id: z.uuid().optional(),
  itemKey: z.string(),
  position: z.number().int().min(0),
  kind: z.string(),
  prompt: z.string(),
  config: z.unknown(),
  answerKey: z.unknown().optional(),
});

export async function saveItem(q: Q, assessmentId: string, input: z.input<typeof itemFormSchema>): Promise<string> {
  const current = await draftAssessment(q, assessmentId);
  const form = itemFormSchema.parse(input);
  const parsed = assessmentItemInputSchema.safeParse({ ...form, answerKey: undefined });
  if (!parsed.success) throw new AssessmentError("invalid", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const item = parsed.data;
  let answerKey: unknown = null;
  if (form.answerKey !== undefined && form.answerKey !== null) {
    const k = answerKeySchema.safeParse(form.answerKey);
    if (!k.success) throw new AssessmentError("invalid", "Answer key: use {optionId}, {optionIds: [...]} or {value, tolerance}.");
    const cfg = item.config;
    const optionIds = "options" in cfg ? new Set(cfg.options.map((o) => o.id)) : null;
    const key = k.data;
    const ok =
      ("optionId" in key && item.kind === "single_choice" && optionIds?.has(key.optionId)) ||
      ("optionIds" in key && item.kind === "multiple_choice" && key.optionIds.every((id) => optionIds?.has(id))) ||
      ("value" in key && item.kind === "numeric");
    if (!ok) throw new AssessmentError("invalid", "The answer key does not fit this item kind or its options.");
    answerKey = key;
  }
  if (item.config.kind === "concept_map") {
    await checkConceptMapConfig(q, item.config, current.isDemo);
    if (current.kind !== "reconstruction") throw new AssessmentError("invalid", "Concept-map items belong to reconstruction assessments.");
  }
  try {
    if (form.id) {
      const r = await q.query(
        "UPDATE assessment_items SET item_key = $3, position = $4, kind = $5, prompt = $6, config = $7, answer_key = $8, updated_at = now() WHERE id = $1 AND assessment_id = $2",
        [form.id, assessmentId, item.itemKey, item.position, item.kind, item.prompt, JSON.stringify(item.config), answerKey === null ? null : JSON.stringify(answerKey)],
      );
      if (!r.rowCount) throw new AssessmentError("not_found", "Item not found");
      return form.id;
    }
    const r = await q.query<{ id: string }>(
      "INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config, answer_key) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
      [assessmentId, item.itemKey, item.position, item.kind, item.prompt, JSON.stringify(item.config), answerKey === null ? null : JSON.stringify(answerKey)],
    );
    return r.rows[0]!.id;
  } catch (err) {
    if (err instanceof AssessmentError) throw err;
    mapDbError(err);
  }
}

async function checkConceptMapConfig(q: Q, rawConfig: unknown, ownerIsDemo: boolean): Promise<void> {
  const config = parseConceptMapConfig(rawConfig);
  if (new Set(config.conceptKeys).size !== config.conceptKeys.length) throw new AssessmentError("invalid", "The concept set lists a concept twice.");
  const c = await q.query<{ key: string; is_demo: boolean }>("SELECT key, is_demo FROM concepts WHERE key = ANY($1::text[])", [config.conceptKeys]);
  const found = new Map(c.rows.map((r) => [r.key, r.is_demo]));
  const missing = config.conceptKeys.filter((k) => !found.has(k));
  if (missing.length) throw new AssessmentError("invalid", `Unknown concept keys: ${missing.join(", ")}`);
  if (!ownerIsDemo && c.rows.some((r) => r.is_demo)) throw new AssessmentError("invalid", "A non-demo assessment cannot use demo concepts.");
  const t = await q.query<{ code: string }>("SELECT code FROM relationship_types WHERE code = ANY($1::text[])", [config.relationshipTypes]);
  const types = new Set(t.rows.map((r) => r.code));
  const unknown = config.relationshipTypes.filter((x) => !types.has(x));
  if (unknown.length) throw new AssessmentError("invalid", `Unknown relationship types: ${unknown.join(", ")}`);
}

export async function deleteItem(q: Q, assessmentId: string, itemId: string): Promise<void> {
  await draftAssessment(q, assessmentId);
  assertUuid(itemId, "Item");
  try {
    await q.query("DELETE FROM assessment_items WHERE id = $1 AND assessment_id = $2", [itemId, assessmentId]);
  } catch (err) {
    mapDbError(err);
  }
}

/** Publishes (locks) a draft version. Locked versions are immutable in the database. */
export async function publishAssessment(q: Q, actorId: string, id: string): Promise<void> {
  const current = await draftAssessment(q, id);
  const items = await q.query<{ kind: string; config: unknown }>("SELECT kind, config FROM assessment_items WHERE assessment_id = $1", [id]);
  if (items.rows.length === 0) throw new AssessmentError("invalid", "Add at least one item before publishing.");
  if (current.kind === "reconstruction") {
    const maps = items.rows.filter((i) => i.kind === "concept_map");
    if (maps.length !== 1) throw new AssessmentError("invalid", "A reconstruction assessment has exactly one concept-map item.");
    await checkConceptMapConfig(q, maps[0]!.config, current.isDemo);
  }
  try {
    await q.query("UPDATE assessments SET status = 'locked', updated_at = now() WHERE id = $1", [id]);
  } catch (err) {
    mapDbError(err);
  }
  await audit(q, { actorId, action: "assessment.publish", entity: "assessments", entityId: id });
}

/** A new draft version (same code, next version number) copying metadata and items. */
export async function createNewVersion(pool: Pool, actorId: string, id: string): Promise<string> {
  assertUuid(id, "Assessment");
  return inTransaction(pool, async (c) => {
    const src = await c.query<{ code: string }>("SELECT code FROM assessments WHERE id = $1", [id]);
    if (!src.rows[0]) throw new AssessmentError("not_found", "Assessment not found");
    const next = await c.query<{ v: number }>("SELECT max(version) + 1 AS v FROM assessments WHERE code = $1", [src.rows[0].code]);
    const ins = await c.query<{ id: string }>(
      `INSERT INTO assessments (code, version, kind, title, description, config, instrument_name, instrument_citation, is_validated_instrument, is_demo, created_by)
       SELECT code, $2, kind, title, description, config, instrument_name, instrument_citation, is_validated_instrument, is_demo, $3 FROM assessments WHERE id = $1
       RETURNING id`,
      [id, next.rows[0]!.v, actorId],
    );
    const newId = ins.rows[0]!.id;
    await c.query(
      `INSERT INTO assessment_items (assessment_id, item_key, position, kind, prompt, config, answer_key, concept_id)
       SELECT $2, item_key, position, kind, prompt, config, answer_key, concept_id FROM assessment_items WHERE assessment_id = $1`,
      [id, newId],
    );
    await audit(c, { actorId, action: "assessment.new_version", entity: "assessments", entityId: newId, after: { from: id } });
    return newId;
  });
}

export async function createRubric(q: Q, actorId: string, assessmentId: string, itemId: string, levels: unknown): Promise<string> {
  assertUuid(assessmentId, "Assessment");
  assertUuid(itemId, "Item");
  const parsed = rubricLevelsSchema.safeParse(levels);
  if (!parsed.success) throw new AssessmentError("invalid", parsed.error.issues[0]?.message ?? "Invalid rubric");
  const item = await q.query<{ kind: string }>("SELECT kind FROM assessment_items WHERE id = $1 AND assessment_id = $2", [itemId, assessmentId]);
  if (!item.rows[0]) throw new AssessmentError("not_found", "Item not found");
  if (!["short_text", "long_text"].includes(item.rows[0].kind)) throw new AssessmentError("invalid", "Rubrics apply to free-text items.");
  const v = await q.query<{ v: number }>("SELECT coalesce(max(version), 0) + 1 AS v FROM scoring_rubrics WHERE assessment_id = $1 AND item_id = $2", [assessmentId, itemId]);
  const sorted = [...parsed.data].sort((a, b) => a.value - b.value);
  const r = await q.query<{ id: string }>(
    "INSERT INTO scoring_rubrics (assessment_id, item_id, version, method, rubric, created_by) VALUES ($1, $2, $3, 'levels', $4, $5) RETURNING id",
    [assessmentId, itemId, v.rows[0]!.v, JSON.stringify({ levels: sorted }), actorId],
  );
  return r.rows[0]!.id;
}

export async function lockRubric(q: Q, actorId: string, rubricId: string): Promise<void> {
  assertUuid(rubricId, "Rubric");
  try {
    const r = await q.query("UPDATE scoring_rubrics SET status = 'locked' WHERE id = $1 AND status = 'draft'", [rubricId]);
    if (!r.rowCount) throw new AssessmentError("not_found", "Draft rubric not found");
  } catch (err) {
    if (err instanceof AssessmentError) throw err;
    mapDbError(err);
  }
  await audit(q, { actorId, action: "rubric.publish", entity: "scoring_rubrics", entityId: rubricId });
}

/** Relationship-type registry (vocabulary a concept-map item may offer). */
export async function listRelationshipTypes(q: Q): Promise<Array<{ code: string; label: string; directed: boolean }>> {
  const r = await q.query<{ code: string; label: string; directed: boolean }>("SELECT code, label, directed FROM relationship_types ORDER BY code");
  return r.rows;
}
