/**
 * Data dictionary of the research export (exportSchemaVersion 1). One entry per table and
 * column; the CSV column order is the order here. `identifiedOnly` tables/columns appear only in
 * identified exports (principal investigator, `exports.identified`).
 *
 * Join keys: participant_code (pseudonym, unique within the study), session_id, condition_id,
 * concept_id (snapshot concept ids, listed in content_manifest.concepts), event_id.
 */
import { metricRoleTable, PRIMARY_OUTCOME, type MetricRole } from "@/features/research/metric-definitions";

export type ColumnType = "uuid" | "text" | "integer" | "number" | "boolean" | "timestamp" | "json";

export interface ColumnSpec {
  name: string;
  type: ColumnType;
  description: string;
}

export interface TableSpec {
  name: string;
  description: string;
  identifiedOnly?: boolean;
  columns: ColumnSpec[];
}

const c = (name: string, type: ColumnType, description: string): ColumnSpec => ({ name, type, description });

export const EXPORT_TABLES: readonly TableSpec[] = [
  {
    name: "conditions",
    description: "Experimental conditions of the study.",
    columns: [
      c("condition_id", "uuid", "Condition id (join key)."),
      c("code", "text", "Condition code."),
      c("interface", "text", "conventional_2d or immersive_3d."),
      c("allocation_weight", "integer", "Relative allocation weight."),
    ],
  },
  {
    name: "participants",
    description: "Pseudonymous participants. No names, emails or contact data exist in the platform.",
    columns: [
      c("participant_code", "text", "Pseudonymous study code (join key)."),
      c("status", "text", "enrolled | active | completed | withdrawn | excluded."),
      c("stratum", "text", "Allocation stratum, if any."),
      c("enrolled_at", "timestamp", "Enrolment time (server clock)."),
      c("withdrawn_at", "timestamp", "Withdrawal time, if withdrawn."),
      c("exclusion_category", "text", "Category part of the recorded exclusion reason (text before ':'), if excluded."),
    ],
  },
  {
    name: "consent_records",
    description: "Consent decisions (append-only history). Identified exports only.",
    identifiedOnly: true,
    columns: [
      c("participant_code", "text", "Participant."),
      c("consent_version", "text", "Version of the consent text."),
      c("consent_text_sha256", "text", "sha256 of the consent text shown."),
      c("decision", "text", "granted | declined | withdrawn."),
      c("method", "text", "on_screen | paper | verbal_witnessed."),
      c("recorded_at", "timestamp", "When the decision was recorded."),
    ],
  },
  {
    name: "allocations",
    description: "Reproducible condition assignments (append-only).",
    columns: [
      c("participant_code", "text", "Participant."),
      c("condition_id", "uuid", "Assigned condition."),
      c("period", "integer", "Period (1 for between-subjects)."),
      c("content_set_code", "text", "Content set of the period (within-subjects)."),
      c("algorithm", "text", "Allocation algorithm."),
      c("seed", "text", "Allocation seed; empty until the study is closed (allocation concealment), as is the seed in the study configuration."),
      c("sequence_index", "integer", "Position in the allocation sequence."),
      c("block_index", "integer", "Block index, if blocked."),
      c("stratum", "text", "Stratum."),
      c("study_protocol_version", "text", "Protocol version at allocation."),
      c("allocated_at", "timestamp", "Allocation time."),
    ],
  },
  {
    name: "sessions",
    description: "Study sessions with version stamps, learning clock and data-quality flags.",
    columns: [
      c("session_id", "uuid", "Session id (join key)."),
      c("participant_code", "text", "Participant."),
      c("condition_id", "uuid", "Condition; empty until the participant is allocated (allocation follows the pre-test, D3)."),
      c("period", "integer", "Period."),
      c("status", "text", "scheduled | in_progress | completed | abandoned."),
      c("snapshot_id", "uuid", "Content snapshot used (equals the study's)."),
      c("manifest_id", "uuid", "Spatial manifest used (equals the study's)."),
      c("app_build", "text", "Application build."),
      c("compiler_version", "text", "Spatial compiler version."),
      c("started_at", "timestamp", "Session start."),
      c("completed_at", "timestamp", "Session completion."),
      c("learning_started_at", "timestamp", "Learning phase start (server clock)."),
      c("learning_budget_seconds", "integer", "Learning budget copied from the frozen study config."),
      c("learning_ended_at", "timestamp", "Learning phase end."),
      c("interrupted", "boolean", "Session was interrupted."),
      c("interruption_count", "integer", "Number of interruptions."),
      c("device", "json", "Coarse device covariates (viewport, input devices, GPU tier, quality tier, a11y settings)."),
      c("withdrawn", "boolean", "Participant withdrew from this session."),
      c("excluded", "boolean", "Excluded from analysis by the principal investigator."),
      c("exclusion_category", "text", "Category of the exclusion reason."),
      c("exclusion_reason", "text", "Full exclusion reason (identified exports only; empty otherwise)."),
      c("non_experimental", "boolean", "Demo / pilot study: never analyse as experimental data."),
      c("open_sequence_gaps", "integer", "Unresolved telemetry sequence gaps (seq numbers never received; seqs that were received and quarantined are counted in quarantined_events, not here)."),
      c("quarantined_events", "integer", "Events quarantined at ingestion."),
    ],
  },
  {
    name: "events",
    description: "Raw telemetry events (append-only), ordered by session and seq.",
    columns: [
      c("event_id", "uuid", "Client event id (join key)."),
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("condition_id", "uuid", "Condition."),
      c("seq", "integer", "Per-session sequence number from 0."),
      c("event_type", "text", "Raw event type (event_types.code)."),
      c("analytic_concept", "text", "Condition-neutral analytic concept of the type."),
      c("client_ts", "timestamp", "Client wall clock at emission."),
      c("client_mono_ms", "number", "Client monotonic clock (performance.now) at emission."),
      c("server_ts", "timestamp", "Server receipt time of the batch."),
      c("concept_id", "uuid", "Snapshot concept id, if any."),
      c("tradition_id", "uuid", "Tradition id, if any."),
      c("category_code", "text", "Knowledge category, if any."),
      c("room_or_page_id", "text", "3D room or 2D page id."),
      c("target", "text", "Interaction target (element id)."),
      c("metadata", "json", "Validated event metadata (allowlisted keys)."),
      c("schema_version", "integer", "Telemetry schema version."),
      c("content_version", "text", "Snapshot version label the client rendered."),
      c("app_build", "text", "Client build."),
    ],
  },
  {
    name: "derived_metrics",
    description: "Versioned behavioural metrics (time accounting, navigation, correspondence). Observational, not outcomes.",
    columns: [
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("condition_id", "uuid", "Condition."),
      c("metric_name", "text", "Metric name (definitions in reproducibility.metricDefinitions)."),
      c("metric_version", "text", "Metric definition version."),
      c("value", "number", "Value (empty when undefined)."),
      c("details", "json", "Breakdown and parameters."),
      c("input_event_count", "integer", "Raw events used."),
      c("input_sha256", "text", "sha256 over the ordered (event_id, seq) list (+ concept map id, revision)."),
      c("pipeline_version", "text", "Pipeline version."),
      c("computed_at", "timestamp", "Computation time."),
    ],
  },
  {
    name: "derived_scores",
    description: "Versioned assessment scores (from the scoring pipeline).",
    columns: [
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("assessment_id", "uuid", "Assessment."),
      c("concept_map_id", "uuid", "Scored concept map, if any."),
      c("response_id", "uuid", "Scored response, if any."),
      c("reference_map_id", "uuid", "Reference map used, if any."),
      c("rubric_id", "uuid", "Rubric used, if any."),
      c("metric_name", "text", "Score name."),
      c("metric_version", "text", "Score definition version."),
      c("value", "number", "Value."),
      c("details", "json", "Breakdown and parameters."),
      c("pipeline_version", "text", "Scoring pipeline version."),
      c("computed_at", "timestamp", "Computation time."),
    ],
  },
  {
    name: "responses",
    description: "Raw assessment item responses (append-only; a new attempt is a new row).",
    columns: [
      c("response_id", "uuid", "Response id."),
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("assessment_id", "uuid", "Assessment."),
      c("item_id", "uuid", "Item."),
      c("item_key", "text", "Item key."),
      c("attempt", "integer", "Administration number of this assessment for the participant (1, 2, ...), counted across sessions."),
      c("step", "text", "Journey step the administration was given in (e.g. questionnaire_pre, questionnaire_post_learning); use it, not the attempt, to tell the SSQ before and after learning apart."),
      c("status", "text", "answered | skipped | timed_out."),
      c("raw", "json", "Answer exactly as submitted."),
      c("presented_at", "timestamp", "Item shown."),
      c("answered_at", "timestamp", "Item answered."),
      c("duration_ms", "integer", "Client-measured duration."),
    ],
  },
  {
    name: "concept_maps",
    description: "Participant concept maps (nodes inline).",
    columns: [
      c("concept_map_id", "uuid", "Map id."),
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("assessment_id", "uuid", "Assessment."),
      c("item_id", "uuid", "Item."),
      c("phase", "text", "pre | post."),
      c("revision", "integer", "Saved revision."),
      c("is_final", "boolean", "Submitted (frozen)."),
      c("nodes", "json", "Nodes [{key, conceptId, label, x, y}]."),
      c("submitted_at", "timestamp", "Submission time."),
    ],
  },
  {
    name: "concept_map_edges",
    description: "Edges of participant concept maps (graph form).",
    columns: [
      c("concept_map_id", "uuid", "Map."),
      c("edge_key", "text", "Edge key."),
      c("source_node_key", "text", "Source node key."),
      c("target_node_key", "text", "Target node key."),
      c("source_concept_id", "uuid", "Source concept."),
      c("target_concept_id", "uuid", "Target concept."),
      c("relationship_type_code", "text", "Relationship type, if typed."),
      c("label", "text", "Participant-typed label, if any."),
      c("directed", "boolean", "Directed edge."),
    ],
  },
  {
    name: "deviations",
    description: "Protocol deviations. Descriptions are free text: identified exports only.",
    columns: [
      c("session_id", "uuid", "Session, if any."),
      c("participant_code", "text", "Participant, if any."),
      c("category", "text", "procedure | technical | consent | timing | allocation | content | other."),
      c("severity", "text", "minor | major."),
      c("reported_at", "timestamp", "Report time."),
      c("description", "text", "Description (identified exports only; empty otherwise)."),
    ],
  },
  {
    name: "annotations",
    description: "Researcher session annotations (free text). Identified exports only.",
    identifiedOnly: true,
    columns: [
      c("session_id", "uuid", "Session."),
      c("kind", "text", "note | observation | technical_issue | data_quality."),
      c("body", "text", "Annotation text."),
      c("created_at", "timestamp", "Creation time."),
    ],
  },
];

/**
 * The metric-role part of the data dictionary: the preregistered primary outcome (D2) and the
 * role of every metric that appears in the export or in the dashboard's definitions table. One
 * source: metricRole() in src/features/research/metric-definitions.ts.
 */
export interface ExportMetricRoles {
  primaryOutcome: typeof PRIMARY_OUTCOME;
  roles: { metric: string; role: MetricRole }[];
}

export function exportMetricRoles(metricNames: readonly string[]): ExportMetricRoles {
  return { primaryOutcome: PRIMARY_OUTCOME, roles: metricRoleTable(metricNames) };
}

export const TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(EXPORT_TABLES.map((t) => [t.name, t]));

// ---------------------------------------------------------------------------------------------
// Research dashboard tables (/research/dashboard). Not part of the export bundle: each is a
// derived, pseudonymised table the dashboard offers as CSV (src/server/research/dashboard.ts),
// preceded by one `#` comment line naming the study, the server time and the metric versions.
// Metric definitions: src/features/research/metric-definitions.ts.
// ---------------------------------------------------------------------------------------------

const SUMMARY_COLUMNS: ColumnSpec[] = [
  c("section", "text", "Dashboard section (primary | secondary | knowledge | questionnaire | telemetry)."),
  c("metric", "text", "Metric key (dashboard Definitions panel)."),
  c("metric_version", "text", "Metric definition version."),
  c("role", "text", "Preregistration role: primary | secondary | exploratory (study decision D2)."),
  c("phase", "text", "pre | post | change | session (one value per session)."),
  c("qualifier", "text", "Assessment code, version and kind, where the metric is per assessment."),
  c("condition_code", "text", "Condition code."),
  c("condition_interface", "text", "conventional_2d or immersive_3d."),
  c("n", "integer", "Values used (excluded and withdrawn sessions left out)."),
  c("missing", "integer", "Undefined values (not imputed)."),
  c("mean", "number", "Mean."),
  c("sd", "number", "Sample standard deviation (n − 1)."),
  c("median", "number", "Median."),
  c("ci95_low", "number", "Lower bound of the 95% t confidence interval of the mean."),
  c("ci95_high", "number", "Upper bound of the 95% t confidence interval of the mean."),
];

export const DASHBOARD_TABLE_NAMES = [
  "dashboard_primary",
  "dashboard_primary_ancova",
  "dashboard_secondary",
  "dashboard_knowledge",
  "dashboard_questionnaires",
  "dashboard_telemetry",
  "dashboard_telemetry_sessions",
  "dashboard_quality",
] as const;

export type DashboardTableName = (typeof DASHBOARD_TABLE_NAMES)[number];

export const DASHBOARD_TABLES: readonly (TableSpec & { name: DashboardTableName })[] = [
  { name: "dashboard_primary", description: "Primary outcome cmap.recall.dl: pre, post and change by condition (descriptive).", columns: SUMMARY_COLUMNS },
  {
    name: "dashboard_primary_ancova",
    description: "ANCOVA-ready table of the primary outcome: one row per participant in scope.",
    columns: [
      c("participant_code", "text", "Pseudonymous study code (join key)."),
      c("condition_code", "text", "Condition of the analysed (post) session."),
      c("condition_interface", "text", "conventional_2d or immersive_3d."),
      c("stratum", "text", "Allocation stratum (latest allocation, else the enrolment stratum)."),
      c("pre_cmap_recall_dl", "number", "Pre-test map cmap.recall.dl (empty when not scored)."),
      c("post_cmap_recall_dl", "number", "Post-learning map cmap.recall.dl (empty when not scored)."),
      c("change_cmap_recall_dl", "number", "post − pre when both exist with the same reference map."),
      c("reference_map_ids", "text", "Reference map(s) the scores were computed against (space-separated)."),
    ],
  },
  { name: "dashboard_secondary", description: "Secondary concept-map outcomes in D2 order, pre and post, by condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_knowledge", description: "Knowledge test and transfer scores (keyed items; rubric ratings) by assessment and condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_questionnaires", description: "Questionnaire scale scores (cognitive load, SUS, presence 3D only, SSQ pre/post) by condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_telemetry", description: "Time accounting and interaction counts per session, summarised by condition. Descriptive covariates, never outcomes (DR-015).", columns: SUMMARY_COLUMNS },
  {
    name: "dashboard_telemetry_sessions",
    description: "Time accounting and interaction counts, one row per session in scope.",
    columns: [
      c("participant_code", "text", "Participant."),
      c("session_id", "uuid", "Session."),
      c("condition_code", "text", "Condition code."),
      c("status", "text", "Session status."),
      c("events", "integer", "Accepted telemetry events."),
      c("exposure_ms", "number", "time.exposure_total_ms (active, pauses excluded)."),
      c("navigation_ms", "number", "time.navigation_ms (active, pauses excluded)."),
      c("pause_ms", "number", "time.pause_ms."),
      c("unterminated_intervals", "integer", "Started intervals with no end event (not guessed)."),
      c("concepts_exposed", "integer", "Distinct concepts shown."),
      c("exposure_coverage", "number", "Concepts shown ÷ concepts in the study snapshot."),
      c("relationships_followed", "integer", "relationship_followed events."),
      c("citation_opens", "integer", "citation_opened events."),
      c("guidance_uses", "integer", "guidance_cue_used events."),
    ],
  },
  {
    name: "dashboard_quality",
    description: "Data-quality counts: sessions by status, sequence anomalies, quarantine by reason, duplicates, interruptions, device and WebGL failures, exclusions by category.",
    columns: [
      c("check", "text", "Quality check."),
      c("detail", "text", "Status, anomaly kind, quarantine reason code, device verdict or exclusion category."),
      c("condition_code", "text", "Condition, where the count is per condition."),
      c("n", "integer", "Count."),
    ],
  },
];

export const DASHBOARD_TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(DASHBOARD_TABLES.map((t) => [t.name, t]));

/**
 * Dashboard rows 3 and 4 of DESIGN.md 11.9 (Figure 3 "Gain by Tradition", Figure 4 "Dwell Time per
 * Layer", Table 2 "Per-Item Statistics"), read from stored derived values by
 * src/server/research/dashboard-extra-tables.ts. Same CSV rules as the tables above.
 */
export const DASHBOARD_EXTRA_TABLE_NAMES = ["dashboard_tradition_gain", "dashboard_dwell", "dashboard_items"] as const;

export type DashboardExtraTableName = (typeof DASHBOARD_EXTRA_TABLE_NAMES)[number];

export const DASHBOARD_EXTRA_TABLES: readonly (TableSpec & { name: DashboardExtraTableName })[] = [
  {
    name: "dashboard_tradition_gain",
    description:
      "Knowledge-test gain by tradition (DR-035, descriptive, not a registered outcome): per session, post-test minus pre-test proportion of keyed items answered correctly, counting only items whose concept belongs to the tradition; summarised by tradition and condition.",
    columns: [
      c("tradition_slug", "text", "Tradition (canonical order)."),
      c("tradition", "text", "Tradition display name."),
      c("condition_code", "text", "Condition code."),
      c("condition_interface", "text", "conventional_2d or immersive_3d."),
      c("n", "integer", "Sessions with scored items of the tradition in both tests."),
      c("mean", "number", "Mean gain (proportion points)."),
      c("sd", "number", "Sample standard deviation (n − 1)."),
      c("median", "number", "Median."),
      c("ci95_low", "number", "Lower bound of the 95% t confidence interval of the mean."),
      c("ci95_high", "number", "Upper bound of the 95% t confidence interval of the mean."),
    ],
  },
  {
    name: "dashboard_dwell",
    description: "Dwell time per knowledge layer: mean active minutes per session with each layer open (pauses excluded), by condition, from time.exposure_by_layer_ms details.byLayer.",
    columns: [
      c("condition_code", "text", "Condition code."),
      c("condition_interface", "text", "conventional_2d or immersive_3d."),
      c("layer", "text", "Telemetry layer id (overview, artisan, process, science, comparison, citation)."),
      c("sessions", "integer", "Sessions with the stored metric."),
      c("mean_minutes", "number", "Mean active minutes per session with the layer open."),
      c("metric_versions", "text", "Stored versions of time.exposure_by_layer_ms (space-separated)."),
    ],
  },
  {
    name: "dashboard_items",
    description: "Per-item statistics: proportion of scored answers matching the answer key (item.key_match), one answer per session and item (latest attempt), by condition.",
    columns: [
      c("assessment", "text", "Assessment code and version."),
      c("kind", "text", "pretest | posttest | transfer."),
      c("item_key", "text", "Item key."),
      c("position", "integer", "Item position in the assessment."),
      c("condition_code", "text", "Condition code."),
      c("condition_interface", "text", "conventional_2d or immersive_3d."),
      c("n", "integer", "Scored answers."),
      c("undefined", "integer", "Answers whose score is undefined (not imputed)."),
      c("correct", "number", "Proportion correct."),
    ],
  },
];

export const DASHBOARD_EXTRA_TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(DASHBOARD_EXTRA_TABLES.map((t) => [t.name, t]));
