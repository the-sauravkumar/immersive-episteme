/**
 * Research export builder: one self-describing bundle per study (JSON), from which per-table
 * CSV files are derived. Contents: the tables in ./dictionary.ts, the study configuration
 * snapshot, content and manifest manifests (hashes), the data dictionary, reproducibility
 * metadata and per-table checksums (sha256 of the canonical JSON of the rows).
 *
 * Scope:
 *  - "pseudonymised" (exports.create; analysts): participants appear only as their pseudonymous
 *    code; no consent records; no researcher free text (annotations, deviation descriptions,
 *    exclusion and withdrawal reasons; only their categories).
 *  - "identified" (exports.identified; principal investigator): adds consent records,
 *    annotations and the free-text fields.
 * Participant-produced research data (responses, concept maps) is in both scopes.
 */
import type { Pool } from "pg";

import { canonicalHash } from "@/features/spatial/compiler/canonical";
import { METRIC_VERSIONS } from "@/features/assessment/scoring/metrics/registry";
import { EVENT_TYPE_REGISTRY } from "@/features/telemetry/contracts";

import { analysisReferences, type AnalysisReference } from "../analysis-reference";
import { METRIC_DEFINITIONS, METRICS_PIPELINE_VERSION } from "../metrics/session";
import { PARITY_GENERATOR_VERSION } from "../parity/engine";
import { ResearchActionError, type Q } from "../db";
import { toCsv, type Row } from "./csv";
import { EXPORT_TABLES, exportMetricRoles, TABLE_BY_NAME, type ExportMetricRoles, type TableSpec } from "./dictionary";
import { buildZip } from "./zip";

export const EXPORT_FORMAT = "immersive-episteme-research-export";
export const EXPORT_SCHEMA_VERSION = 1;

export type ExportScope = "pseudonymised" | "identified";

export interface ContentManifest {
  snapshot: { id: string; versionLabel: string; kind: string; status: string; payloadSha256: string; itemCount: number; includesUnverified: boolean } | null;
  snapshotItems: { kind: string; ref: string; sha256: string }[];
  manifest: { id: string; manifestHash: string; compilerVersion: string; seed: string; traditions: string[]; status: string; ruleSetId: string; ruleSetConfigSha256: string } | null;
  /** Concept facts needed to join events and recompute navigation metrics. */
  concepts: { id: string; key: string; traditionId: string | null; category: string }[];
  relationships: { id: string; sourceId: string; targetId: string; type: string; directed: boolean }[];
}

export interface ExportBundle {
  format: typeof EXPORT_FORMAT;
  exportSchemaVersion: number;
  scope: ExportScope;
  generatedAt: string;
  study: { id: string; slug: string; title: string; status: string; protocolVersion: string; design: string; isDemo: boolean; config: unknown; snapshotId: string | null; manifestId: string | null; activatedAt: string | null; battery: unknown[];
    /**
     * The study's analysis reference map per reconstruction assessment (final review scoring-04):
     * analyses read concept-map scores against these maps only (src/server/research/analysis-reference.ts).
     */
    analysisReferenceMaps: AnalysisReference[];
  };
  contentManifest: ContentManifest;
  reproducibility: {
    appBuild: string;
    exportSchemaVersion: number;
    metricsPipelineVersion: string;
    /** Current version of every concept-map metric family; analyses read scores at these versions. */
    scoringMetricVersions: Record<string, string>;
    parityGeneratorVersion: string;
    metricDefinitions: typeof METRIC_DEFINITIONS;
    eventTypes: { code: string; analyticConcept: string; scope: string; technical: boolean }[];
    database: { serverVersion: string };
    latestParityReport: { id: string; passed: boolean; reportSha256: string; createdAt: string } | null;
    observationalNotice: string;
  };
  dataDictionary: readonly TableSpec[];
  /**
   * Preregistration role of every metric in this export (primary | secondary | exploratory), from
   * the shared definitions table (src/features/research/metric-definitions.ts, metricRole).
   */
  metricRoles: ExportMetricRoles;
  tables: Record<string, Row[]>;
  checksums: Record<string, string>;
}

const ts = (col: string) => `to_json(${col})#>>'{}'`;
const category = (col: string) => `NULLIF(split_part(coalesce(${col}, ''), ':', 1), '')`;

export function tableChecksum(rows: readonly Row[]): string {
  return canonicalHash(rows);
}

/**
 * `buildExportBundle` inside one REPEATABLE READ, READ ONLY transaction: its ~16 queries then
 * read ONE database snapshot, so during live collection no table can hold rows (events,
 * responses, map edges) of a session or map that another table does not have yet, and every
 * session's status matches its events (final review telemetry-04). Use this for downloads.
 */
export async function buildExportBundleConsistent(pool: Pool, studyId: string, opts: { scope: ExportScope; appBuild: string; now?: Date }): Promise<ExportBundle> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    const bundle = await buildExportBundle(client, studyId, opts);
    await client.query("COMMIT");
    return bundle;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Allocation concealment (final review study-07): while a study is open, anyone who knew the seed
 * could recompute the next assignment, so exports carry it only once the study is closed (the
 * allocation audit stays reproducible from then on).
 */
function concealSeed(config: unknown, status: string): unknown {
  if (status === "closed" || !config || typeof config !== "object") return config;
  const c = config as Record<string, unknown>;
  const allocation = c.allocation as Record<string, unknown> | undefined;
  if (!allocation || !("seed" in allocation)) return config;
  return { ...c, allocation: { ...allocation, seed: null } };
}

export async function buildExportBundle(q: Q, studyId: string, opts: { scope: ExportScope; appBuild: string; now?: Date }): Promise<ExportBundle> {
  const identified = opts.scope === "identified";
  const s = await q.query<Record<string, unknown>>(
    `SELECT id, slug, title, status::text AS status, protocol_version, design::text AS design, is_demo, config, snapshot_id, manifest_id, ${ts("activated_at")} AS activated_at
       FROM studies WHERE id = $1`,
    [studyId],
  );
  const st = s.rows[0];
  if (!st) throw new ResearchActionError("Study not found");
  const p = [studyId];
  const rows = async (sql: string, params: unknown[] = p) => (await q.query<Row>(sql, params)).rows;

  const tables: Record<string, Row[]> = {
    conditions: await rows(`SELECT id AS condition_id, code, interface::text AS interface, allocation_weight FROM study_conditions WHERE study_id = $1 ORDER BY position, code`),
    participants: await rows(
      `SELECT code AS participant_code, status::text AS status, stratum, ${ts("enrolled_at")} AS enrolled_at, ${ts("withdrawn_at")} AS withdrawn_at,
              ${category("exclusion_reason")} AS exclusion_category
         FROM participants WHERE study_id = $1 ORDER BY code`,
    ),
    allocations: await rows(
      `SELECT p.code AS participant_code, a.condition_id, a.period, a.content_set_code, a.algorithm::text AS algorithm,
              CASE WHEN (SELECT status FROM studies WHERE id = $1) = 'closed' THEN a.seed END AS seed, a.sequence_index,
              a.block_index, a.stratum, a.study_protocol_version, ${ts("a.allocated_at")} AS allocated_at
         FROM allocations a JOIN participants p ON p.id = a.participant_id WHERE a.study_id = $1 ORDER BY a.sequence_index, a.period`,
    ),
    sessions: await rows(
      `SELECT ss.id AS session_id, p.code AS participant_code, ss.condition_id, ss.period, ss.status::text AS status, ss.snapshot_id, ss.manifest_id,
              ss.app_build, ss.compiler_version, ${ts("ss.started_at")} AS started_at, ${ts("ss.completed_at")} AS completed_at,
              ${ts("ss.learning_started_at")} AS learning_started_at, ss.learning_budget_seconds, ${ts("ss.learning_ended_at")} AS learning_ended_at,
              ss.interrupted, ss.interruption_count, ss.device, ss.withdrawn, ss.excluded, ${category("ss.exclusion_reason")} AS exclusion_category,
              CASE WHEN $2 THEN ss.exclusion_reason END AS exclusion_reason,
              (st.is_demo OR coalesce((st.config->>'nonExperimental')::boolean, false)) AS non_experimental,
              (SELECT count(*)::int FROM sequence_gaps g WHERE g.session_id = ss.id AND g.kind = 'gap' AND g.resolved_at IS NULL) AS open_sequence_gaps,
              (SELECT count(*)::int FROM telemetry_quarantine tq WHERE tq.session_id = ss.id) AS quarantined_events
         FROM study_sessions ss JOIN participants p ON p.id = ss.participant_id JOIN studies st ON st.id = ss.study_id
        WHERE ss.study_id = $1 ORDER BY p.code, ss.period`,
      [studyId, identified],
    ),
    events: await rows(
      `SELECT te.event_id, te.session_id, p.code AS participant_code, te.condition_id, te.seq, te.event_type_code AS event_type, et.analytic_concept,
              ${ts("te.client_ts")} AS client_ts, te.client_mono_ms, ${ts("te.server_ts")} AS server_ts, te.concept_id, te.tradition_id, te.category_code,
              te.room_or_page_id, te.target, te.metadata, te.schema_version, te.content_version, te.app_build
         FROM telemetry_events te JOIN participants p ON p.id = te.participant_id JOIN event_types et ON et.code = te.event_type_code
        WHERE te.study_id = $1 ORDER BY te.session_id, te.seq`,
    ),
    derived_metrics: await rows(
      `SELECT dm.session_id, p.code AS participant_code, dm.condition_id, dm.metric_name, dm.metric_version, dm.value, dm.details,
              dm.input_event_count, dm.input_sha256, dm.pipeline_version, ${ts("dm.computed_at")} AS computed_at
         FROM derived_metrics dm JOIN participants p ON p.id = dm.participant_id WHERE dm.study_id = $1
        ORDER BY dm.session_id, dm.metric_name, dm.metric_version`,
    ),
    derived_scores: await rows(
      `SELECT ds.session_id, p.code AS participant_code, ds.assessment_id, ds.concept_map_id, ds.response_id, ds.reference_map_id, ds.rubric_id,
              ds.metric_name, ds.metric_version, ds.value, ds.details, ds.pipeline_version, ${ts("ds.computed_at")} AS computed_at
         FROM derived_scores ds JOIN study_sessions ss ON ss.id = ds.session_id JOIN participants p ON p.id = ds.participant_id
        WHERE ss.study_id = $1 ORDER BY ds.session_id, ds.metric_name, ds.computed_at, ds.id`,
    ),
    responses: await rows(
      `SELECT r.id AS response_id, r.session_id, p.code AS participant_code, r.assessment_id, r.item_id, ai.item_key, r.attempt,
              (SELECT al.after->>'step' FROM audit_log al
                WHERE al.entity = 'study_session' AND al.entity_id = r.session_id::text AND al.action = 'study.assessment_submitted'
                  AND al.after->>'assessmentId' = r.assessment_id::text AND (al.after->>'attempt')::int = r.attempt
                LIMIT 1) AS step,
              r.status::text AS status,
              r.raw, ${ts("r.presented_at")} AS presented_at, ${ts("r.answered_at")} AS answered_at, r.duration_ms
         FROM responses r JOIN study_sessions ss ON ss.id = r.session_id JOIN participants p ON p.id = r.participant_id
         JOIN assessment_items ai ON ai.id = r.item_id
        WHERE ss.study_id = $1 ORDER BY r.session_id, ai.item_key, r.attempt`,
    ),
    concept_maps: await rows(
      `SELECT cm.id AS concept_map_id, cm.session_id, p.code AS participant_code, cm.assessment_id, cm.item_id, cm.phase::text AS phase, cm.revision,
              cm.is_final, cm.nodes, ${ts("cm.submitted_at")} AS submitted_at
         FROM concept_maps cm JOIN study_sessions ss ON ss.id = cm.session_id JOIN participants p ON p.id = cm.participant_id
        WHERE ss.study_id = $1 ORDER BY cm.session_id, cm.phase, cm.id`,
    ),
    concept_map_edges: await rows(
      `SELECT e.concept_map_id, e.edge_key, e.source_node_key, e.target_node_key, e.source_concept_id, e.target_concept_id,
              e.relationship_type_code, e.label, e.directed
         FROM concept_map_edges e JOIN concept_maps cm ON cm.id = e.concept_map_id JOIN study_sessions ss ON ss.id = cm.session_id
        WHERE ss.study_id = $1 ORDER BY e.concept_map_id, e.edge_key`,
    ),
    deviations: await rows(
      `SELECT d.session_id, p.code AS participant_code, d.category, d.severity::text AS severity, ${ts("d.reported_at")} AS reported_at,
              CASE WHEN $2 THEN d.description END AS description
         FROM protocol_deviations d LEFT JOIN participants p ON p.id = d.participant_id WHERE d.study_id = $1 ORDER BY d.reported_at, d.id`,
      [studyId, identified],
    ),
  };
  if (identified) {
    tables.consent_records = await rows(
      `SELECT p.code AS participant_code, cr.consent_version, cr.consent_text_sha256, cr.decision::text AS decision, cr.method, ${ts("cr.recorded_at")} AS recorded_at
         FROM consent_records cr JOIN participants p ON p.id = cr.participant_id WHERE p.study_id = $1 ORDER BY p.code, cr.recorded_at`,
    );
    tables.annotations = await rows(
      `SELECT a.session_id, a.kind, a.body, ${ts("a.created_at")} AS created_at
         FROM session_annotations a JOIN study_sessions ss ON ss.id = a.session_id WHERE ss.study_id = $1 ORDER BY a.created_at, a.id`,
    );
  }
  // Column order and completeness exactly as the dictionary says.
  for (const [name, list] of Object.entries(tables)) {
    const spec = TABLE_BY_NAME.get(name)!;
    tables[name] = list.map((r) => Object.fromEntries(spec.columns.map((col) => [col.name, r[col.name] ?? null])));
  }

  const contentManifest = await loadContentManifest(q, st.snapshot_id as string | null, st.manifest_id as string | null);
  const battery = await rows(
    `SELECT sa.assessment_id, a.code, a.version, a.kind::text AS kind, a.status::text AS status, sa.phase::text AS phase, sa.position, sa.required
       FROM study_assessments sa JOIN assessments a ON a.id = sa.assessment_id WHERE sa.study_id = $1 ORDER BY sa.phase, sa.position`,
  );
  const db = await q.query<{ v: string }>("SELECT current_setting('server_version') AS v");
  const parity = await q.query<{ id: string; passed: boolean; reportSha256: string; createdAt: string }>(
    `SELECT id, passed, report_sha256 AS "reportSha256", ${ts("created_at")} AS "createdAt" FROM parity_reports WHERE report->>'studyId' = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    p,
  );

  return {
    format: EXPORT_FORMAT,
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    scope: opts.scope,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    study: {
      id: String(st.id),
      slug: String(st.slug),
      title: String(st.title),
      status: String(st.status),
      protocolVersion: String(st.protocol_version),
      design: String(st.design),
      isDemo: Boolean(st.is_demo),
      config: concealSeed(st.config, String(st.status)),
      snapshotId: (st.snapshot_id as string | null) ?? null,
      manifestId: (st.manifest_id as string | null) ?? null,
      activatedAt: (st.activated_at as string | null) ?? null,
      battery,
      analysisReferenceMaps: await analysisReferences(q, studyId),
    },
    contentManifest,
    reproducibility: {
      appBuild: opts.appBuild,
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      metricsPipelineVersion: METRICS_PIPELINE_VERSION,
      scoringMetricVersions: { ...METRIC_VERSIONS },
      parityGeneratorVersion: PARITY_GENERATOR_VERSION,
      metricDefinitions: METRIC_DEFINITIONS,
      eventTypes: EVENT_TYPE_REGISTRY.map((e) => ({ code: e.code, analyticConcept: e.analyticConcept, scope: e.scope, technical: "isTechnical" in e && e.isTechnical === true })),
      database: { serverVersion: db.rows[0]?.v ?? "unknown" },
      latestParityReport: parity.rows[0] ?? null,
      observationalNotice:
        "Behavioural metrics are observational descriptions of navigation; they are not learning outcomes and support no causal claim. All statistical analysis is exploratory until the researchers approve the analysis plan.",
    },
    dataDictionary: EXPORT_TABLES.filter((t) => identified || !t.identifiedOnly),
    metricRoles: exportMetricRoles([...(tables.derived_scores ?? []), ...(tables.derived_metrics ?? [])].map((r) => String(r.metric_name))),
    tables,
    checksums: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, tableChecksum(v)])),
  };
}

async function loadContentManifest(q: Q, snapshotId: string | null, manifestId: string | null): Promise<ContentManifest> {
  if (!snapshotId) return { snapshot: null, snapshotItems: [], manifest: null, concepts: [], relationships: [] };
  const snap = await q.query<{ id: string; versionLabel: string; kind: string; status: string; payloadSha256: string; itemCount: number; includesUnverified: boolean; concepts: unknown; relationships: unknown; types: unknown }>(
    `SELECT id, version_label AS "versionLabel", kind, status::text AS status, payload_sha256 AS "payloadSha256", item_count AS "itemCount",
            includes_unverified AS "includesUnverified", payload->'concepts' AS concepts, payload->'relationships' AS relationships,
            payload->'relationshipTypes' AS types
       FROM content_snapshots WHERE id = $1`,
    [snapshotId],
  );
  const s = snap.rows[0];
  const items = await q.query<{ kind: string; ref: string; sha256: string }>(
    "SELECT item_kind::text AS kind, entity_ref AS ref, item_sha256 AS sha256 FROM snapshot_items WHERE snapshot_id = $1 ORDER BY item_kind, entity_ref",
    [snapshotId],
  );
  const man = manifestId
    ? await q.query<NonNullable<ContentManifest["manifest"]>>(
        `SELECT m.id, m.manifest_hash AS "manifestHash", m.compiler_version AS "compilerVersion", m.seed, m.traditions, m.status::text AS status,
                m.rule_set_id AS "ruleSetId", r.config_sha256 AS "ruleSetConfigSha256"
           FROM spatial_manifests m JOIN mapping_rule_sets r ON r.id = m.rule_set_id WHERE m.id = $1`,
        [manifestId],
      )
    : null;
  const rawConcepts = (s?.concepts as { id: string; key: string; traditionId?: string | null; category?: string }[] | null) ?? [];
  const idByKey = new Map(rawConcepts.map((c) => [c.key, c.id]));
  const directed = new Map(((s?.types as { code: string; directed?: boolean }[] | null) ?? []).map((t) => [t.code, t.directed !== false]));
  return {
    snapshot: s ? { id: s.id, versionLabel: s.versionLabel, kind: s.kind, status: s.status, payloadSha256: s.payloadSha256, itemCount: s.itemCount, includesUnverified: s.includesUnverified } : null,
    snapshotItems: items.rows,
    manifest: man?.rows[0] ?? null,
    concepts: rawConcepts.map((c) => ({ id: c.id, key: c.key, traditionId: c.traditionId ?? null, category: c.category ?? "unknown" })),
    relationships: ((s?.relationships as { id: string; source: string; target: string; type: string }[] | null) ?? []).flatMap((r) => {
      const a = idByKey.get(r.source);
      const b = idByKey.get(r.target);
      return a && b ? [{ id: r.id, sourceId: a, targetId: b, type: r.type, directed: directed.get(r.type) ?? true }] : [];
    }),
  };
}

/**
 * Every table of a bundle as CSV in one ZIP, with `manifest.json` (the bundle without its rows:
 * generatedAt, study, dictionary, reproducibility metadata and the per-table checksums). The
 * files come from one bundle, hence one database snapshot; separately downloaded CSV files are
 * built at separate moments and must not be mixed during collection.
 */
export function bundleCsvZip(bundle: ExportBundle): Uint8Array {
  const names = Object.keys(bundle.tables).filter((t) => TABLE_BY_NAME.has(t));
  const manifest = {
    ...bundle,
    tables: undefined, // the rows are the CSV files (JSON.stringify drops undefined)
    csvFiles: names.map((t) => `${t}.csv`),
    csvNotes: [
      "Every CSV file in this archive was built from the same database snapshot (generatedAt).",
      "checksums are sha256 of the canonical JSON of each table's rows (the JSON bundle), not of the CSV text.",
      "A text cell a spreadsheet would read as a formula (starting with = + - @, tab or carriage return) begins with an added ' character; remove it when loading the data.",
    ],
  };
  return buildZip(
    [{ name: "manifest.json", data: JSON.stringify(manifest, null, 2) }, ...names.map((t) => ({ name: `${t}.csv`, data: bundleTableCsv(bundle, t) }))],
    new Date(bundle.generatedAt),
  );
}

/** One table of a bundle as CSV, columns in dictionary order. */
export function bundleTableCsv(bundle: ExportBundle, table: string): string {
  const spec = TABLE_BY_NAME.get(table);
  const data = bundle.tables[table];
  if (!spec || !data) throw new ResearchActionError(`No table ${table} in this export`);
  return toCsv(data, spec.columns.map((c) => c.name));
}
