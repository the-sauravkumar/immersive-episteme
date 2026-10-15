/**
 * The ONE definitions table for every metric the research dashboard shows (/research/dashboard,
 * "Definitions" panel and CSV headers). Each entry gives the metric name and version, what it
 * measures, its unit, the file that computes it and its citation.
 *
 * Citation rule (docs/research/citation-policy.md, lead instruction): a citation is quoted
 * VERBATIM from docs/research/study-decisions.md, with the source and locator given there; no
 * other quote is used. tests/unit/research/metric-definitions.test.ts checks every quote against
 * that file (whitespace-normalised). A metric with no literature source says "Project definition".
 *
 * Versions come from the code that computes the metric (METRIC_VERSIONS, TIMING_METRICS_VERSION,
 * KEY_MATCH_METRIC, SCALE_SCORE_VERSION); the two server-side constants that cannot be imported
 * here (assessment.key_match_total, rubric ratings) are pinned by the same unit test.
 */
import { METRIC_VERSIONS } from "@/features/assessment/scoring/metrics/registry";
import { TIMING_METRICS_VERSION } from "@/features/telemetry/metrics";

import { SCALE_SCORE_VERSION } from "./scale-scores";

/** Version of the aggregations defined by the dashboard itself (change scores, counts, coverage). */
export const DASHBOARD_METRICS_VERSION = "1.0.0";

/**
 * Preregistration role of a metric (study-decisions.md D2): the primary outcome is
 * cmap.recall.dl on the post-learning map with the pre-test score as covariate; the secondary
 * outcomes, in D2 order, are cmap.recall.du, cmap.precision.dl with edges drawn, cmap.f1.dl,
 * cmap.cross_category.valid_normalised and the raw valid count. Everything else is exploratory.
 */
export type MetricRole = "primary" | "secondary" | "exploratory";

export const PRIMARY_OUTCOME = { metric: "cmap.recall.dl", phase: "post", covariate: { metric: "cmap.recall.dl", phase: "pre" }, model: "ANCOVA", decision: "D2" } as const;

/** Secondary outcomes in D2 order. */
export const SECONDARY_OUTCOMES = ["cmap.recall.du", "cmap.precision.dl", "cmap.edges_drawn", "cmap.incorrect_relationships", "cmap.f1.dl", "cmap.cross_category.valid_normalised", "cmap.valid_relationships"] as const;

/** Role of ANY metric name (stored scores, behavioural metrics, dashboard aggregates). */
export function metricRole(name: string): MetricRole {
  if (name === PRIMARY_OUTCOME.metric) return "primary";
  return (SECONDARY_OUTCOMES as readonly string[]).includes(name) ? "secondary" : "exploratory";
}

export type MetricGroup = "primary" | "secondary" | "knowledge" | "questionnaire" | "telemetry" | "quality";

export interface Citation {
  /** Source as named in study-decisions.md. */
  source: string;
  /** Page / locator as given in study-decisions.md. */
  locator: string;
  /** Verbatim from study-decisions.md. */
  quote: string;
  /** study-decisions.md marks the source secondary (a reprint; the original was not accessible). */
  secondary?: boolean;
}

export interface MetricDefinition {
  key: string;
  /** Preregistration role, from metricRole() (one source). */
  role: MetricRole;
  label: string;
  group: MetricGroup;
  version: string;
  measures: string;
  unit: string;
  /** How it is computed and where (repository path). */
  computation: string;
  computedIn: string;
  citation: Citation | null;
  /** Shown when there is no citation, or to say what the citation does and does not support. */
  note?: string;
}

const SCORING = "src/features/assessment/scoring/metrics/overlap.ts (stored by src/server/assessment/scoring.ts)";
const DASH = "src/server/research/dashboard.ts";
const TIMING = "src/features/telemetry/metrics.ts (computeTimingMetrics, applied live by src/server/research/dashboard.ts)";
const SCALES = "src/features/research/scale-scores.ts";
const PROJECT = "Project definition.";

const RUIZ_PRIMO: Citation = {
  source: "Ruiz-Primo (2000), Revista Electrónica de Investigación Educativa 2(1)",
  locator: "p. 48 (PDF p. 20)",
  quote:
    "The convergence score -the proportion of valid propositions in the students' map out of the possible propositions in the criterion map-seems to better reflect systematic differences in students' connected understanding and it is the most effort and time efficient indicator.",
};

const DEFINITIONS: readonly Omit<MetricDefinition, "role">[] = [
  // ---- Primary outcome (D2) ----------------------------------------------------------------
  {
    key: "cmap.recall.dl",
    label: "Expert-map coverage (pre and post)",
    group: "primary",
    version: METRIC_VERSIONS["cmap.recall"],
    measures: "Expert-map coverage of a final concept map: matches to expected edges of the adjudicated reference map (direction and relation type must match) ÷ the number of expected edges.",
    unit: "proportion (0–1)",
    computation: "Directed, labelled match against the reference map's expected edges; optional edges neutral, out-of-scope edges excluded.",
    computedIn: SCORING,
    citation: RUIZ_PRIMO,
  },
  {
    key: "cmap.recall.dl.change",
    label: "Expert-map coverage change (post − pre)",
    group: "primary",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Within-participant change of cmap.recall.dl from the pre-test map to the post-learning map.",
    unit: "proportion points",
    computation: "post − pre for participants with both scores (same reference map); undefined otherwise, never imputed. The confirmatory analysis is the ANCOVA of post with pre as covariate (analysis/episteme_stats).",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  // ---- Secondary outcomes, in D2 order ------------------------------------------------------
  {
    key: "cmap.recall.du",
    label: "Coverage ignoring relation type",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.recall"],
    measures: "Expert-map coverage with direction but not relation type required (D2 secondary 1: sensitivity analysis).",
    unit: "proportion (0–1)",
    computation: "As cmap.recall.dl at the directed, unlabelled match level.",
    computedIn: SCORING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.precision.dl",
    label: "Precision",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.precision"],
    measures: "Share of the participant's edges that match reference edges, directed and labelled (D2 secondary 2: guards against over-linking).",
    unit: "proportion (0–1)",
    computation: "Matched edges ÷ edges drawn (optional reference edges neutral).",
    computedIn: SCORING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.edges_drawn",
    label: "Edges drawn",
    group: "secondary",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Number of edges on the participant's final map (reported with precision, D2).",
    unit: "count",
    computation: "Count of concept_map_edges of the final map.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.incorrect_relationships",
    label: "Incorrect relationships",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.incorrect_relationships"],
    measures: "Edges that match no reference edge (D2 secondary 2: reported with precision and edges drawn, as a guard against over-linking).",
    unit: "count",
    computation: "Count of participant edges classed incorrect by the scoring library.",
    computedIn: "src/features/assessment/scoring/metrics/counts.ts",
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.f1.dl",
    label: "F1",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.f1"],
    measures: "Harmonic mean of precision and coverage, directed and labelled (D2 secondary 3).",
    unit: "proportion (0–1)",
    computation: "2 · precision · recall ÷ (precision + recall).",
    computedIn: SCORING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.cross_category.valid_normalised",
    label: "Cross-category relationships (normalised)",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.cross_category.valid_normalised"],
    measures: "Valid relationships between concepts of different knowledge categories ÷ expected cross-category reference edges (D2 secondary 4).",
    unit: "proportion",
    computation: "Valid cross-category edges ÷ expected cross-category edges of the reference map.",
    computedIn: "src/features/assessment/scoring/metrics/cross-category.ts",
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.valid_relationships",
    label: "Valid relationships (raw count)",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.valid_relationships"],
    measures: "Raw number of valid relations, reported only for comparability with the concept note (D2 secondary 5).",
    unit: "count",
    computation: "Count of participant edges matching a reference edge.",
    computedIn: "src/features/assessment/scoring/metrics/counts.ts",
    citation: {
      source: "Concept note (CN) §9, as quoted in study-decisions.md D2",
      locator: "CN §9, P99",
      quote: "Possible measures include number of valid relations, incorrect relations, depth of causal chains, structural similarity to an expert reference map, and increase in cross-category relationships.",
    },
    note: "A raw count grows with map size, so it is a comparability measure only (D2).",
  },
  // ---- Knowledge test and transfer ----------------------------------------------------------
  {
    key: "assessment.key_match_total",
    label: "Knowledge test and transfer: keyed items correct",
    group: "knowledge",
    version: "1.0.0",
    measures: "Number of keyed items answered correctly in one administration of a pre-test, post-test or transfer assessment.",
    unit: "count of items",
    computation: "Sum of item.key_match (1 = matches the answer key) over the assessment's keyed items.",
    computedIn: "src/server/study/engine.ts (item rule: src/features/assessment/responses.ts)",
    citation: null,
    note: PROJECT,
  },
  {
    key: "rubric.rating.mean",
    label: "Transfer: rubric rating (mean across raters)",
    group: "knowledge",
    version: "1.0.0",
    measures: "Rubric level given to open transfer answers, averaged over raters and rated answers of the session.",
    unit: "rubric level",
    computation: "Mean of all rubric.rating.r<rater> values of the session's answers for the assessment. Agreement statistics are on the Scoring page.",
    computedIn: "src/server/assessment/scoring.ts (ratings); averaged in src/server/research/dashboard.ts",
    citation: null,
    note: PROJECT,
  },
  // ---- Questionnaires (D7) -----------------------------------------------------------------
  {
    key: "cl.intrinsic",
    label: "Cognitive load: intrinsic",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Intrinsic cognitive load (items il.1–il.3).",
    unit: "mean item rating (0–10)",
    computation: "Mean of the 3 items; undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Leppink et al. (2013), Behavior Research Methods 45",
      locator: "p. 1061 (PDF p. 4)",
      quote: "Cronbach's alpha values of .81 for Items 1, 2, and 3 (expected to measure IL); .75 for Items 4, 5, and 6 (expected to measure EL)",
    },
    note: "The citation supports the item grouping; the mean is a project definition.",
  },
  {
    key: "cl.extraneous_instructions",
    label: "Cognitive load: extraneous (instructions)",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Extraneous load from instructions and explanations (items el-instr.4–el-instr.6).",
    unit: "mean item rating (0–10)",
    computation: "Mean of the 3 items; undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Leppink et al. (2013), Behavior Research Methods 45",
      locator: "p. 1060 (PDF p. 3)",
      quote: "Items 4, 5, and 6 all deal with negative characteristics of instructions and explanations",
    },
    note: "The mean is a project definition.",
  },
  {
    key: "cl.extraneous_interaction",
    label: "Cognitive load: extraneous (interaction)",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Extraneous load from the interaction technique (items el-int.1–el-int.4).",
    unit: "mean item rating (0–10)",
    computation: "Mean of the 4 items; undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Andersen & Makransky (2021, MCLS-POL)",
      locator: "p. 2 (PDF p. 2)",
      quote: "the EL dimension should be split into three subscales measuring distinct forms of EL in virtual reality environments.",
      secondary: true,
    },
    note: "The mean is a project definition.",
  },
  {
    key: "cl.extraneous_environment",
    label: "Cognitive load: extraneous (environment)",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Extraneous load from the learning environment (items el-env.1–el-env.4).",
    unit: "mean item rating (0–10)",
    computation: "Mean of the 4 items; undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Andersen & Makransky (2021, MCLS-POL)",
      locator: "p. 2 (PDF p. 2)",
      quote: "the EL dimension should be split into three subscales measuring distinct forms of EL in virtual reality environments.",
      secondary: true,
    },
    note: "The mean is a project definition.",
  },
  {
    key: "sus.score",
    label: "System Usability Scale",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Perceived usability (10 items, 5-point).",
    unit: "score (0–100)",
    computation: "Odd items: response − 1; even items: 5 − response; sum × 2.5. Undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Bangor, Kortum & Miller (2009)",
      locator: "p. 115 (PDF p. 2)",
      quote: "the SUS was highly reliable (alpha = 0.91)",
    },
    note: "The citation concerns reliability only. The scoring rule is the conventional SUS rule and a project definition here: study-decisions.md quotes no scoring rule (Brooke 1996 is not archived).",
  },
  {
    key: "presence.physical",
    label: "Physical presence (3D only)",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "MPS physical-presence subscale, 3D condition only, analysed within that group (D7c).",
    unit: "mean item rating (1–5)",
    computation: "Mean of the 5 items; undefined if any item is missing.",
    computedIn: SCALES,
    citation: {
      source: "Petersen, Petkakis & Makransky (2022), Computers & Education 179",
      locator: "p. 14 (PDF p. 14)",
      quote: "The virtual environment seemed real to me.",
    },
    note: "The citation is an item of the scale (study-decisions.md D7); the mean is a project definition.",
  },
  {
    key: "ssq.total",
    label: "Simulator sickness (pre and post)",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Simulator-sickness symptoms before and after learning, a safety screen and covariate (D7d), not an outcome.",
    unit: "SSQ Total Score (0–235.62)",
    computation: "Kennedy et al. (1993) Table 4: the 16 ratings (0–3) summed per Nausea, Oculomotor and Disorientation column (unit weights; symptoms may count in two columns), TS = (N + O + D sums) × 3.74. First administration = pre, second = post.",
    computedIn: SCALES,
    citation: {
      source: "Eudave et al. (2025)",
      locator: "p. 9 (PDF p. 9)",
      quote: "we identified a key limitation in the reduced reliability of both tools when applied in Desktop conditions",
    },
    note: "The citation is why the SSQ is a screen and covariate only. Scoring: Kennedy, Lane, Berbaum & Lilienthal (1993), p. 212 (PDF p. 11), Table 4 (study-decisions.md D7).",
  },
  // ---- Telemetry and time (DR-015: descriptive covariates, never outcomes) -----------------
  {
    key: "time.exposure_total_ms",
    label: "Content-exposure time",
    group: "telemetry",
    version: TIMING_METRICS_VERSION,
    measures: "Active time with concept content in view (2D: content area ≥ 50% in view; 3D: information panel open), pauses excluded.",
    unit: "minutes (stored in ms)",
    computation: "Sum of exposure_ended.metadata.activeMs; unterminated intervals are counted, not guessed.",
    computedIn: TIMING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "time.navigation_ms",
    label: "Navigation time",
    group: "telemetry",
    version: TIMING_METRICS_VERSION,
    measures: "Active time moving or browsing with no concept content open, pauses excluded.",
    unit: "minutes (stored in ms)",
    computation: "Sum of navigation_ended.metadata.activeMs.",
    computedIn: TIMING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "time.pause_ms",
    label: "Pause time",
    group: "telemetry",
    version: TIMING_METRICS_VERSION,
    measures: "Time the interval clock was paused (tab hidden, window blurred, non-content modal).",
    unit: "minutes (stored in ms)",
    computation: "Sum of timing_resumed.metadata.pausedMs.",
    computedIn: TIMING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "exposure.concepts",
    label: "Concepts exposed",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Distinct concepts whose content was shown in the session.",
    unit: "count",
    computation: "Distinct concept_id of exposure_started and concept_encountered events.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "exposure.coverage",
    label: "Exposure coverage of the study scope",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Share of the study's in-scope concepts actually shown (D5: a descriptive variable per condition).",
    unit: "proportion (0–1)",
    computation: "Concepts exposed that belong to the study snapshot ÷ concepts in the study snapshot.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "nav.relationships_followed",
    label: "Relationships followed",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Moves along a typed relationship (2D link, 3D path or portal).",
    unit: "count",
    computation: "Count of relationship_followed events.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "citation.openings",
    label: "Citation opens",
    group: "telemetry",
    version: TIMING_METRICS_VERSION,
    measures: "Times a source citation was opened.",
    unit: "count",
    computation: "Count of citation_opened events.",
    computedIn: TIMING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "guidance.uses",
    label: "Guidance uses",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Hints and stall cues shown and followed or dismissed (D6: every use logged; identical in both pathways).",
    unit: "count",
    computation: "Count of guidance_cue_used events.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "telemetry.events",
    label: "Events per session",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Accepted raw telemetry events of a session.",
    unit: "count",
    computation: "Count of telemetry_events rows of the session.",
    computedIn: "src/server/research/sessions.ts (listSessions)",
    citation: null,
    note: PROJECT,
  },
  // ---- Data quality ------------------------------------------------------------------------
  {
    key: "quality.sequence_gaps",
    label: "Sequence anomalies",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Telemetry sequence anomalies detected at ingestion: gaps (open or resolved), duplicates and out-of-order arrivals.",
    unit: "count",
    computation: "sequence_gaps rows by kind; missing seq numbers = Σ(to_seq − from_seq + 1) of open gaps.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "quality.quarantine",
    label: "Quarantined events",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Events refused at ingestion, by reason (schema, session_mismatch, seq_conflict, rejected).",
    unit: "count",
    computation: "telemetry_quarantine rows of the study's sessions, grouped by the reason code (text before ':').",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "quality.duplicates",
    label: "Duplicate uploads",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Duplicate event uploads detected and not double-counted.",
    unit: "count",
    computation: "Σ telemetry_batches.duplicate_count + duplicate sequence anomalies.",
    computedIn: "src/server/research/sessions.ts (listSessions)",
    citation: null,
    note: PROJECT,
  },
  {
    key: "quality.interruptions",
    label: "Interruptions",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Sessions interrupted and resumed, and the number of interruptions.",
    unit: "count",
    computation: "study_sessions.interrupted / interruption_count.",
    computedIn: "src/server/research/sessions.ts (listSessions)",
    citation: null,
    note: PROJECT,
  },
  {
    key: "quality.device_failures",
    label: "Device and WebGL failures",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Sessions whose latest device check did not pass, WebGL context losses and uncaught client errors.",
    unit: "count",
    computation: "study_sessions.device.check.verdict ≠ passed; counts of webgl_context_lost and client_error events.",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
  {
    key: "quality.exclusions",
    label: "Exclusions",
    group: "quality",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Sessions excluded from analysis, by reason category; withdrawn sessions.",
    unit: "count",
    computation: "study_sessions.excluded grouped by the category of exclusion_reason (text before ':'); free-text detail is not shown (pseudonymised view).",
    computedIn: DASH,
    citation: null,
    note: PROJECT,
  },
];

export const METRIC_DEFINITIONS: readonly MetricDefinition[] = DEFINITIONS.map((d) => ({ ...d, role: metricRole(d.key) }));

/** Role table for the export data dictionary: primary, then secondary in D2 order, then exploratory (by name). */
export function metricRoleTable(extraNames: readonly string[] = []): { metric: string; role: MetricRole }[] {
  const rank = (m: string) => (m === PRIMARY_OUTCOME.metric ? -1 : (SECONDARY_OUTCOMES as readonly string[]).indexOf(m) >= 0 ? (SECONDARY_OUTCOMES as readonly string[]).indexOf(m) : SECONDARY_OUTCOMES.length);
  const names = [...new Set([...METRIC_DEFINITIONS.map((d) => d.key), ...extraNames])].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return names.map((metric) => ({ metric, role: metricRole(metric) }));
}

export const METRIC_BY_KEY: ReadonlyMap<string, MetricDefinition> = new Map(METRIC_DEFINITIONS.map((d) => [d.key, d]));

export function metricDefinition(key: string): MetricDefinition {
  const d = METRIC_BY_KEY.get(key);
  if (!d) throw new Error(`No metric definition for ${key}`);
  return d;
}

/** "name@version" list for CSV header rows. */
export function metricVersionHeader(keys: readonly string[]): string {
  return keys.map((k) => `${k}@${metricDefinition(k).version}`).join("; ");
}
