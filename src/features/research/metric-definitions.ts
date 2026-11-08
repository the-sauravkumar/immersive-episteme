import { METRIC_VERSIONS } from "@/features/assessment/scoring/metrics/registry";
import { TIMING_METRICS_VERSION } from "@/features/telemetry/metrics";

import { SCALE_SCORE_VERSION } from "./scale-scores";

export const DASHBOARD_METRICS_VERSION = "1.0.0";

export type MetricRole = "primary" | "secondary" | "exploratory";

export const PRE_TEST_COVARIATE = { metric: "test.pre_test", phase: "pre" } as const;

export const PRIMARY_OUTCOMES = ["test.sequence", "test.stage_placement"] as const;

export const PRIMARY_OUTCOME = { metric: PRIMARY_OUTCOMES[0], metrics: PRIMARY_OUTCOMES, phase: "post", delayedPhase: "follow_up", covariate: PRE_TEST_COVARIATE, model: "ANCOVA", delayedModel: "Mixed model, time by condition", decision: "Concept Note rev2, H1" } as const;

export const SECONDARY_OUTCOMES = [
  "test.identification",
  "test.cloth_state",
  "test.attribution",
  "test.transfer",
  "cmap.recall.dl",
  "common.mental_effort",
  "common.navigation_effort",
  "common.comfort",
  "common.engagement",
  "stage.total_ms",
] as const;

export const HYPOTHESES = [
  { id: "H1", statement: "The walkthrough group scores higher on sequence and stage association, with a larger difference at the delayed test.", metrics: PRIMARY_OUTCOMES, analysis: "ANCOVA at the immediate test; mixed model immediate versus delayed", direction: "immersive higher" },
  { id: "H2", statement: "Identification of labelled tools and materials does not differ.", metrics: ["test.identification"], analysis: "ANCOVA with an equivalence reading of the interval", direction: "no difference" },
  { id: "H3", statement: "Perceived load is somewhat higher in the walkthrough; navigation load is measured apart from content difficulty.", metrics: ["common.mental_effort", "common.navigation_effort"], analysis: "Group comparison of each rating", direction: "immersive higher" },
] as const;

export function metricRole(name: string): MetricRole {
  if ((PRIMARY_OUTCOMES as readonly string[]).includes(name)) return "primary";
  return (SECONDARY_OUTCOMES as readonly string[]).includes(name) ? "secondary" : "exploratory";
}

const testScore = (key: string, label: string, measures: string, group: MetricGroup = "knowledge"): Omit<MetricDefinition, "role"> => ({
  key,
  label,
  group,
  version: "1.0.0",
  measures,
  unit: "proportion 0-1",
  computation: "Sum of item.key_match over the assessment's keyed items divided by the number of keyed items; a skipped item counts 0. Sequence items earn the share of stage pairs in the right order, matching items the share of pairs right. Battery phase separates pre, immediate (post) and delayed (follow_up).",
  computedIn: "src/server/study/engine.ts (submitAssessment)",
  citation: null,
  note: PROJECT,
});

const behaviour = (key: string, label: string, measures: string, unit: string): Omit<MetricDefinition, "role"> => ({
  key,
  label,
  group: "telemetry",
  version: "1",
  measures,
  unit,
  computation: "Computed from the ordered stage and walk events.",
  computedIn: "src/server/research/metrics/stage.ts",
  citation: null,
  note: PROJECT,
});

const commonRating = (key: string, label: string, measures: string): Omit<MetricDefinition, "role"> => ({
  key,
  label,
  group: "questionnaire",
  version: SCALE_SCORE_VERSION,
  measures,
  unit: "rating 1-7",
  computation: "The participant's single rating. Project wording, not a validated scale.",
  computedIn: "src/features/research/scale-scores.ts",
  citation: null,
  note: PROJECT,
});

export type MetricGroup = "primary" | "secondary" | "knowledge" | "questionnaire" | "telemetry" | "quality";

interface Citation {
  source: string;
  locator: string;
  quote: string;
  secondary?: boolean;
}

export interface MetricDefinition {
  key: string;
  role: MetricRole;
  label: string;
  group: MetricGroup;
  version: string;
  measures: string;
  unit: string;
  computation: string;
  computedIn: string;
  citation: Citation | null;
  note?: string;
}

const SCORING = "src/features/assessment/scoring/metrics/overlap.ts (stored by src/server/assessment/scoring.ts)";
const DASH = "src/server/research/dashboard.ts";
const TIMING = "src/features/telemetry/metrics.ts (computeTimingMetrics, applied live by src/server/research/dashboard-rollups.ts)";
const ROLLUP = "src/server/research/dashboard-rollups.ts";
const SCALES = "src/features/research/scale-scores.ts";
const PROJECT = "Project definition.";

const RUIZ_PRIMO: Citation = {
  source: "Ruiz-Primo (2000), Revista Electrónica de Investigación Educativa 2(1)",
  locator: "p. 48 (PDF p. 20)",
  quote:
    "The convergence score -the proportion of valid propositions in the students' map out of the possible propositions in the criterion map-seems to better reflect systematic differences in students' connected understanding and it is the most effort and time efficient indicator.",
};

const DEFINITIONS: readonly Omit<MetricDefinition, "role">[] = [
  {
    key: "cmap.recall.dl",
    label: "Expert-map coverage",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.recall"],
    measures: "Expert-map coverage of the final post-learning concept map: matches to expected edges of the adjudicated reference map (direction and relation type must match) ÷ the number of expected edges. Primary under D2; secondary since DR-075, which moved the map to after learning only.",
    unit: "proportion (0–1)",
    computation: "Directed, labelled match against the reference map's expected edges; optional edges neutral, out-of-scope edges excluded.",
    computedIn: SCORING,
    citation: RUIZ_PRIMO,
  },
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
    computation: "Matched edges ÷ edges drawn; an edge matching only an optional reference edge is left out of both (optionalMatch = neutral, the default since scoring pipeline 1.1.0; each score stores the value it used).",
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
    computation: "2 × precision × recall ÷ (precision + recall).",
    computedIn: SCORING,
    citation: null,
    note: PROJECT,
  },
  {
    key: "cmap.cross_category.valid_normalised",
    label: "Cross-category relationships (normalised)",
    group: "secondary",
    version: METRIC_VERSIONS["cmap.cross_category.valid_normalised"],
    measures: "Coverage of the expected relationships between concepts of different knowledge categories (D2 secondary 4).",
    unit: "proportion (0–1)",
    computation: "Expected cross-category reference edges the participant matched (as recall counts them) ÷ expected cross-category edges of the reference map (v1.1.0; v1.0.0 counted valid participant edges, optional matches included, and could exceed 1).",
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
    computation: "Count of participant edges matching an expected reference edge at the validity level; edges matching only an optional edge are not counted (optionalMatch = neutral, the default since scoring pipeline 1.1.0).",
    computedIn: "src/features/assessment/scoring/metrics/counts.ts",
    citation: {
      source: "Concept note (CN) §9, as quoted in study-decisions.md D2",
      locator: "CN §9, P99",
      quote: "Possible measures include number of valid relations, incorrect relations, depth of causal chains, structural similarity to an expert reference map, and increase in cross-category relationships.",
    },
    note: "A raw count grows with map size, so it is a comparability measure only (D2).",
  },
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
    key: "umux_lite.score",
    label: "UMUX-LITE score",
    group: "questionnaire",
    version: SCALE_SCORE_VERSION,
    measures: "Perceived usability from the two UMUX-LITE items (umux-lite.1, umux-lite.2), when a study gives the instrument instead of or beside the SUS.",
    unit: "score (0–100)",
    computation: "Each 7-point answer minus 1, the two summed, times 100/12; undefined if either item is missing. The regression adjustment to the SUS scale (.65 × score + 22.9) is not applied.",
    computedIn: SCALES,
    citation: {
      source: "Lewis, Utesch & Maher (2013), CHI 2013",
      locator: "p. 2102 (PDF p. 4)",
      quote: "subtract 1 from each 7-point item, add them together, then multiply by 100/12",
    },
    note: "The unadjusted score is kept: the regression to the SUS was fitted on the original wording, which D7 changes.",
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
  testScore("test.pre_test", "Pre-Test Score", "Prior knowledge, the covariate of every test score."),
  testScore("test.identification", "Identification", "Recognition: naming a tool or material from its image (H2)."),
  testScore("test.stage_placement", "Stage Placement", "Association: the stage at which a tool or material is used (H1).", "primary"),
  testScore("test.sequence", "Sequence", "Order of shuffled stage cards per tradition (H1).", "primary"),
  testScore("test.cloth_state", "Cloth State", "Matching a cloth state to the stage that produces it."),
  testScore("test.attribution", "Attribution", "Assigning a finished product image to its tradition."),
  testScore("test.transfer", "Transfer", "Predicting order or next stage for an unseen tradition."),
  commonRating("common.mental_effort", "Mental Effort", "Perceived mental effort of learning (H3)."),
  commonRating("common.navigation_effort", "Navigation Effort", "Perceived effort of moving through the material, apart from content difficulty (H3)."),
  commonRating("common.comfort", "Comfort", "Perceived comfort during learning."),
  commonRating("common.engagement", "Engagement", "Perceived engagement during learning."),
  behaviour("stage.total_ms", "Total Stage Time", "Active time across all stages, an outcome of self-paced learning.", "ms"),
  behaviour("stage.revisits", "Stage Revisits", "Returns to a stage already seen, in both doors.", "count"),
  behaviour("stage.back_steps", "Back-Steps", "Moves to an earlier stage of the same tradition, in both doors.", "count"),
  {
    key: "stage.stops_visited",
    label: "Stops Visited",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Distinct stops entered, stages and the product stop of each tradition, in both doors.",
    unit: "count",
    computation: "Distinct tradition and stage keys of stage_entered events.",
    computedIn: ROLLUP,
    citation: null,
    note: PROJECT,
  },
  {
    key: "stage.sources_opened",
    label: "Sources Opened",
    group: "telemetry",
    version: DASHBOARD_METRICS_VERSION,
    measures: "Times the sources behind a stage caption were opened, in both doors.",
    unit: "count",
    computation: "Count of source_opened events.",
    computedIn: ROLLUP,
    citation: null,
    note: PROJECT,
  },
  behaviour("walk.object_dwell_ms", "Object Dwell", "Door 2: time near labelled objects, by object.", "ms"),
  behaviour("walk.approach_distance_m", "Approach Distance", "Door 2: how close the learner came to each object.", "m"),
  behaviour("walk.viewpoint_changes", "Viewpoint Changes", "Door 2: changes of view direction.", "count"),
  behaviour("walk.wrong_turns", "Wrong Turns", "Door 2: moves away from the next station.", "count"),
  behaviour("walk.walking_ms", "Walking Time", "Door 2: time moving, recorded apart from viewing.", "ms"),
  behaviour("walk.viewing_ms", "Viewing Time", "Door 2: time standing at a station.", "ms"),
  behaviour("walk.path_length_m", "Path Length", "Door 2: length of the walked path.", "m"),
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
    measures: "Sessions whose latest device check did not pass, 3D views that failed during practice or learning, and uncaught client errors.",
    unit: "count",
    computation: "study_sessions.device.check.verdict ≠ passed; study.webgl_failed journal entries of the study's sessions, by step; count of client_error events.",
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

export function metricRoleTable(extraNames: readonly string[] = []): { metric: string; role: MetricRole }[] {
  const order: readonly string[] = [...PRIMARY_OUTCOMES, ...SECONDARY_OUTCOMES];
  const rank = (m: string) => (order.includes(m) ? order.indexOf(m) : order.length);
  const names = [...new Set([...METRIC_DEFINITIONS.map((d) => d.key), ...extraNames])].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return names.map((metric) => ({ metric, role: metricRole(metric) }));
}

export const METRIC_BY_KEY: ReadonlyMap<string, MetricDefinition> = new Map(METRIC_DEFINITIONS.map((d) => [d.key, d]));

export function metricDefinition(key: string): MetricDefinition {
  const d = METRIC_BY_KEY.get(key);
  if (!d) throw new Error(`No metric definition for ${key}`);
  return d;
}

export function metricVersionHeader(keys: readonly string[]): string {
  return keys.map((k) => `${k}@${metricDefinition(k).version}`).join("; ");
}
