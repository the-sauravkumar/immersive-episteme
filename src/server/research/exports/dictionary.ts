import { HYPOTHESES, metricRoleTable, PRIMARY_OUTCOME, type MetricRole } from "@/features/research/metric-definitions";

type ColumnType = "uuid" | "text" | "integer" | "number" | "boolean" | "timestamp" | "json";

interface ColumnSpec {
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
      c("learning_budget_seconds", "integer", "Learning cap copied from the frozen study config."),
      c("learning_ended_at", "timestamp", "Learning phase end. End minus start is total learning time, an outcome of self-paced learning."),
      c("template_sha256", "text", "SHA-256 of the canonical JSON of the stage templates both doors served, recorded when learning started; it names the captions and stops the session saw, whatever the build label."),
      c("tradition_order", "json", "Counterbalanced order of the traditions assigned to this session."),
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
      c("content_version", "text", "Snapshot version label the client rendered. The stage course (content/study templates) is not part of the snapshot; it ships inside the build, so app_build identifies it."),
      c("app_build", "text", "Client build: the deployed commit's short SHA on Git deploys, which also identifies the stage templates served."),
    ],
  },
  {
    name: "derived_metrics",
    description: "Versioned behavioural metrics (time accounting, stages, walking, navigation, correspondence). Time on task is an outcome under self-paced learning; the rest describe behaviour.",
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
    name: "stage_visits",
    description: "Server record of every stage entry, in both doors. Required stops include the product stop of each tradition.",
    columns: [
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("tradition_key", "text", "Tradition."),
      c("stage_key", "text", "Stage key, or products for the product stop."),
      c("stage_number", "integer", "Stage number in process order."),
      c("visit_index", "integer", "Position of this entry in the session, from 0."),
      c("entered_at", "timestamp", "Entry (server clock)."),
      c("left_at", "timestamp", "Exit (server clock)."),
      c("active_ms", "integer", "Client-measured active time, pauses excluded."),
    ],
  },
  {
    name: "learning_ends",
    description: "How learning ended, per session, with the stages left unvisited when the cap was reached.",
    columns: [
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("reason", "text", "finished | cap_reached."),
      c("stages_required", "integer", "Required stops."),
      c("stages_visited", "integer", "Required stops visited."),
      c("unvisited", "json", "Stops not visited [{traditionKey, stageKey, stageNumber}]."),
    ],
  },
  {
    name: "delayed_test_schedule",
    description: "Delayed test schedule per session. Reminders go out from this list; the platform holds no contact data.",
    columns: [
      c("session_id", "uuid", "Session."),
      c("participant_code", "text", "Participant."),
      c("scheduled_at", "timestamp", "When the schedule was made, at the end of the immediate part."),
      c("opens_at", "timestamp", "Window opens."),
      c("due_at", "timestamp", "Reminder date, about 7 days later."),
      c("closes_at", "timestamp", "Window closes."),
      c("returned_at", "timestamp", "First return inside the window."),
      c("completed_at", "timestamp", "Delayed test submitted."),
      c("status", "text", "waiting | due | returned | completed | missed."),
    ],
  },
  {
    name: "test_item_targets",
    description: "What each test item asks about, for item-level recall against stage and object behaviour (RQ3).",
    columns: [
      c("assessment_id", "uuid", "Assessment."),
      c("assessment_code", "text", "Assessment code."),
      c("item_key", "text", "Item key (joins responses)."),
      c("test_type", "text", "Item type."),
      c("tradition_key", "text", "Tradition the item is about."),
      c("stage_key", "text", "Stage the item is about, if any."),
      c("object_key", "text", "Tool or material the item is about, if any."),
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

export interface ExportMetricRoles {
  primaryOutcome: typeof PRIMARY_OUTCOME;
  hypotheses: typeof HYPOTHESES;
  roles: { metric: string; role: MetricRole }[];
}

export function exportMetricRoles(metricNames: readonly string[]): ExportMetricRoles {
  return { primaryOutcome: PRIMARY_OUTCOME, hypotheses: HYPOTHESES, roles: metricRoleTable(metricNames) };
}

export const TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(EXPORT_TABLES.map((t) => [t.name, t]));

const SUMMARY_COLUMNS: ColumnSpec[] = [
  c("section", "text", "Dashboard section (primary | secondary | knowledge | questionnaire | telemetry)."),
  c("metric", "text", "Metric key (dashboard Definitions panel)."),
  c("metric_version", "text", "Metric definition version."),
  c("role", "text", "Preregistration role: primary | secondary | exploratory (DR-075)."),
  c("phase", "text", "pre | post | follow_up (delayed test) | session (one value per session)."),
  c("qualifier", "text", "Assessment code, version and kind, where the metric is per assessment; covariate for the pre-test score in dashboard_primary."),
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
  { name: "dashboard_primary", description: "Primary outcomes test.sequence and test.stage_placement at the immediate (post) and delayed (follow_up) test, and the pre-test covariate test.pre_test, by condition (descriptive).", columns: SUMMARY_COLUMNS },
  {
    name: "dashboard_primary_ancova",
    description: "ANCOVA-ready table of the primary outcomes: one row per participant in scope.",
    columns: [
      c("participant_code", "text", "Pseudonymous study code (join key)."),
      c("condition_code", "text", "Condition of the analysed (post) session."),
      c("condition_interface", "text", "conventional_2d or immersive_3d."),
      c("stratum", "text", "Allocation stratum (latest allocation, else the enrolment stratum)."),
      c("pre_test", "number", "test.pre_test, the covariate (empty when not taken)."),
      c("sequence_immediate", "number", "test.sequence at the immediate test (empty when not taken)."),
      c("sequence_delayed", "number", "test.sequence at the delayed test (empty when not taken)."),
      c("stage_placement_immediate", "number", "test.stage_placement at the immediate test (empty when not taken)."),
      c("stage_placement_delayed", "number", "test.stage_placement at the delayed test (empty when not taken)."),
    ],
  },
  { name: "dashboard_secondary", description: "Concept-map outcomes in D2 order from the post-learning map, by condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_knowledge", description: "Knowledge test and transfer scores (keyed items; rubric ratings) by assessment and condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_questionnaires", description: "Questionnaire scale scores (common questions, cognitive load when the study gives it, SUS, UMUX-LITE when the study gives it, presence 3D only, SSQ pre/post) by condition.", columns: SUMMARY_COLUMNS },
  { name: "dashboard_telemetry", description: "Stage time, pauses, stops, revisits, back-steps, sources opened and events per session, summarised by condition.", columns: SUMMARY_COLUMNS },
  {
    name: "dashboard_telemetry_sessions",
    description: "Stage time, pauses, stops, revisits, back-steps, sources opened and events, one row per session in scope.",
    columns: [
      c("participant_code", "text", "Participant."),
      c("session_id", "uuid", "Session."),
      c("condition_code", "text", "Condition code."),
      c("status", "text", "Session status."),
      c("events", "integer", "Accepted telemetry events."),
      c("stage_ms", "number", "stage.total_ms: active time at the stages, from stage_left events (pauses excluded)."),
      c("stops_visited", "integer", "stage.stops_visited: distinct stops entered."),
      c("revisits", "integer", "stage.revisits."),
      c("back_steps", "integer", "stage.back_steps."),
      c("sources_opened", "integer", "stage.sources_opened: source_opened events."),
      c("pause_ms", "number", "time.pause_ms."),
    ],
  },
  {
    name: "dashboard_quality",
    description: "Data-quality counts: sessions by status, sequence anomalies, quarantine by reason, duplicates, interruptions, device check failures, 3D view failures by step (study.webgl_failed), client errors, exclusions by category.",
    columns: [
      c("check", "text", "Quality check."),
      c("detail", "text", "Status, anomaly kind, quarantine reason code, device verdict, journey step of a 3D view failure or exclusion category."),
      c("condition_code", "text", "Condition, where the count is per condition."),
      c("n", "integer", "Count."),
    ],
  },
];

export const DASHBOARD_TABLE_BY_NAME: ReadonlyMap<string, TableSpec> = new Map(DASHBOARD_TABLES.map((t) => [t.name, t]));

export const DASHBOARD_EXTRA_TABLE_NAMES = ["dashboard_tradition_gain", "dashboard_items"] as const;

export type DashboardExtraTableName = (typeof DASHBOARD_EXTRA_TABLE_NAMES)[number];

const DASHBOARD_EXTRA_TABLES: readonly (TableSpec & { name: DashboardExtraTableName })[] = [
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
