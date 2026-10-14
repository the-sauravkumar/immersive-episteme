/**
 * Assessment domain: versioned instruments, raw responses, participant concept maps,
 * expert reference maps (with raters and adjudication), rubrics and derived scores.
 *
 * Raw data and derived scores are kept separate: `responses` / `concept_maps` hold exactly
 * what the participant produced; `derived_scores` hold versioned computations over them.
 *
 * Raw-data immutability (migration 0005 triggers): `responses` are append-only (a new attempt
 * is a new row); a `concept_maps` row is frozen once `is_final`, and every saved state is
 * copied into the append-only `concept_map_revisions`, so autosaves never overwrite history;
 * `derived_scores` are append-only (rescoring adds rows keyed by reference map / rubric).
 * The only way to remove raw participant data is a reasoned purge
 * (`app.research_purge_reason`, e.g. consent withdrawal).
 * Instruments are never presented as validated unless a citation is recorded
 * (MP:593 "Do not invent a supposedly validated instrument").
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorId,
  assessmentItemKindEnum,
  assessmentKindEnum,
  conceptMapPhaseEnum,
  createdAt,
  isDemo,
  lockableStatusEnum,
  pk,
  raterRoleEnum,
  referenceMapStatusEnum,
  requiredActorId,
  responseStatusEnum,
  studyPhaseEnum,
  tsz,
  updatedAt,
} from "./_common";
import { concepts, relationshipTypes } from "./knowledge";
import { contentSnapshots } from "./publishing";
import { studies, studySessions } from "./study";

export const assessments = pgTable(
  "assessments",
  {
    id: pk(),
    code: text().notNull(),
    version: integer().notNull(),
    kind: assessmentKindEnum().notNull(),
    title: text().notNull(),
    description: text(),
    config: jsonb().notNull().default(sql`'{}'::jsonb`),
    instrumentName: text(),
    instrumentCitation: text(),
    isValidatedInstrument: boolean().notNull().default(false),
    status: lockableStatusEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lockedAt: tsz(),
  },
  (t) => [
    unique("assessments_code_version_uq").on(t.code, t.version),
    check("assessments_code_ck", sql`${t.code} ~ '^[a-z][a-z0-9_-]{1,63}$'`),
    check("assessments_version_ck", sql`${t.version} > 0`),
    check(
      "assessments_validated_ck",
      sql`NOT ${t.isValidatedInstrument} OR (${t.instrumentName} IS NOT NULL AND ${t.instrumentCitation} IS NOT NULL)`,
    ),
    check(
      "assessments_demo_ck",
      sql`${t.isDemo} = (${t.code} LIKE 'demo%') AND (NOT ${t.isDemo} OR (${t.title} LIKE 'Demo:%' AND NOT ${t.isValidatedInstrument}))`,
    ),
    check("assessments_locked_ck", sql`${t.status} <> 'locked' OR ${t.lockedAt} IS NOT NULL`),
  ],
);

/** The assessment battery of a study, in protocol order. */
export const studyAssessments = pgTable(
  "study_assessments",
  {
    studyId: uuid()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    phase: studyPhaseEnum().notNull(),
    position: smallint().notNull(),
    required: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.studyId, t.assessmentId, t.phase] }),
    unique("study_assessments_order_uq").on(t.studyId, t.phase, t.position),
  ],
);

export const assessmentItems = pgTable(
  "assessment_items",
  {
    id: pk(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    itemKey: text().notNull(),
    position: smallint().notNull(),
    kind: assessmentItemKindEnum().notNull(),
    prompt: text().notNull(),
    /** Options, scale anchors, concept set for concept-map items, ... */
    config: jsonb().notNull().default(sql`'{}'::jsonb`),
    answerKey: jsonb(),
    conceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("assessment_items_key_uq").on(t.assessmentId, t.itemKey),
    unique("assessment_items_position_uq").on(t.assessmentId, t.position),
    unique("assessment_items_id_assessment_uq").on(t.id, t.assessmentId),
    check("assessment_items_key_ck", sql`${t.itemKey} ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'`),
    check("assessment_items_prompt_ck", sql`length(btrim(${t.prompt})) > 0`),
  ],
);

/** Raw item responses. */
export const responses = pgTable(
  "responses",
  {
    id: pk(),
    sessionId: uuid().notNull(),
    participantId: uuid().notNull(),
    assessmentId: uuid().notNull(),
    itemId: uuid().notNull(),
    attempt: smallint().notNull().default(1),
    status: responseStatusEnum().notNull(),
    raw: jsonb(),
    presentedAt: tsz(),
    answeredAt: tsz(),
    clientTs: tsz(),
    serverReceivedAt: tsz().notNull().defaultNow(),
    durationMs: integer(),
  },
  (t) => [
    unique("responses_attempt_uq").on(t.sessionId, t.itemId, t.attempt),
    foreignKey({
      name: "responses_session_fk",
      columns: [t.sessionId, t.participantId],
      foreignColumns: [studySessions.id, studySessions.participantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "responses_item_fk",
      columns: [t.itemId, t.assessmentId],
      foreignColumns: [assessmentItems.id, assessmentItems.assessmentId],
    }).onDelete("restrict"),
    check("responses_attempt_ck", sql`${t.attempt} > 0`),
    check(
      "responses_answered_ck",
      sql`${t.status} <> 'answered' OR (${t.raw} IS NOT NULL AND ${t.answeredAt} IS NOT NULL)`,
    ),
    check(
      "responses_order_ck",
      sql`${t.answeredAt} IS NULL OR ${t.presentedAt} IS NULL OR ${t.answeredAt} >= ${t.presentedAt}`,
    ),
    check("responses_duration_ck", sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`),
    index("responses_assessment_idx").on(t.assessmentId, t.participantId),
  ],
);

export const scoringRubrics = pgTable(
  "scoring_rubrics",
  {
    id: pk(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    itemId: uuid().references(() => assessmentItems.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    method: text().notNull(),
    rubric: jsonb().notNull(),
    status: lockableStatusEnum().notNull().default("draft"),
    createdBy: actorId(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("scoring_rubrics_uq").on(t.assessmentId, t.itemId, t.version).nullsNotDistinct(),
    check("scoring_rubrics_version_ck", sql`${t.version} > 0`),
  ],
);

/** Expert reference map for a reconstruction assessment, versioned and adjudicated. */
export const referenceMaps = pgTable(
  "reference_maps",
  {
    id: pk(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    snapshotId: uuid().references(() => contentSnapshots.id, { onDelete: "restrict" }),
    version: integer().notNull(),
    title: text().notNull(),
    description: text(),
    /** Concept set of the map: [{ conceptId, label }]. */
    nodes: jsonb().notNull().default(sql`'[]'::jsonb`),
    status: referenceMapStatusEnum().notNull().default("draft"),
    adjudicatedBy: actorId(),
    adjudicatedAt: tsz(),
    adjudicationNotes: text(),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("reference_maps_version_uq").on(t.assessmentId, t.version),
    check("reference_maps_nodes_ck", sql`jsonb_typeof(${t.nodes}) = 'array'`),
    check(
      "reference_maps_adjudicated_ck",
      sql`${t.status} = 'draft' OR (${t.adjudicatedBy} IS NOT NULL AND ${t.adjudicatedAt} IS NOT NULL)`,
    ),
    check("reference_maps_demo_ck", sql`NOT ${t.isDemo} OR (${t.title} LIKE 'Demo:%' AND ${t.status} = 'draft')`),
  ],
);

export const referenceMapEdges = pgTable(
  "reference_map_edges",
  {
    id: pk(),
    referenceMapId: uuid()
      .notNull()
      .references(() => referenceMaps.id, { onDelete: "cascade" }),
    sourceConceptId: uuid()
      .notNull()
      .references(() => concepts.id, { onDelete: "restrict" }),
    targetConceptId: uuid()
      .notNull()
      .references(() => concepts.id, { onDelete: "restrict" }),
    relationshipTypeCode: text().references(() => relationshipTypes.code, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    directed: boolean().notNull().default(true),
    weight: doublePrecision().notNull().default(1),
    /** Must appear for full credit (vs. acceptable-but-optional). */
    required: boolean().notNull().default(false),
    /** Inter-rater agreement for this edge in [0, 1], if computed. */
    agreement: doublePrecision(),
    notes: text(),
  },
  (t) => [
    unique("reference_map_edges_uq")
      .on(t.referenceMapId, t.sourceConceptId, t.targetConceptId, t.relationshipTypeCode)
      .nullsNotDistinct(),
    check("reference_map_edges_self_ck", sql`${t.sourceConceptId} <> ${t.targetConceptId}`),
    check("reference_map_edges_weight_ck", sql`${t.weight} > 0`),
    check(
      "reference_map_edges_agreement_ck",
      sql`${t.agreement} IS NULL OR (${t.agreement} >= 0 AND ${t.agreement} <= 1)`,
    ),
  ],
);

/** Individual expert submissions that the adjudicated reference map was built from. */
export const referenceMapRaters = pgTable(
  "reference_map_raters",
  {
    id: pk(),
    referenceMapId: uuid()
      .notNull()
      .references(() => referenceMaps.id, { onDelete: "cascade" }),
    raterId: requiredActorId(),
    role: raterRoleEnum().notNull().default("rater"),
    submission: jsonb().notNull(),
    submittedAt: tsz().notNull().defaultNow(),
    notes: text(),
  },
  (t) => [unique("reference_map_raters_uq").on(t.referenceMapId, t.raterId, t.role)],
);

/** A participant's raw concept map (nodes inline; edges normalised for scoring/export). */
export const conceptMaps = pgTable(
  "concept_maps",
  {
    id: pk(),
    sessionId: uuid().notNull(),
    participantId: uuid().notNull(),
    assessmentId: uuid().notNull(),
    itemId: uuid().notNull(),
    phase: conceptMapPhaseEnum().notNull(),
    /** [{ key, conceptId|null, label, x, y }] exactly as produced by the editor. */
    nodes: jsonb().notNull().default(sql`'[]'::jsonb`),
    /** Full editor state for audit. */
    raw: jsonb().notNull().default(sql`'{}'::jsonb`),
    revision: integer().notNull().default(1),
    isFinal: boolean().notNull().default(false),
    startedAt: tsz(),
    submittedAt: tsz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("concept_maps_session_item_phase_uq").on(t.sessionId, t.itemId, t.phase),
    foreignKey({
      name: "concept_maps_session_fk",
      columns: [t.sessionId, t.participantId],
      foreignColumns: [studySessions.id, studySessions.participantId],
    }).onDelete("restrict"),
    foreignKey({
      name: "concept_maps_item_fk",
      columns: [t.itemId, t.assessmentId],
      foreignColumns: [assessmentItems.id, assessmentItems.assessmentId],
    }).onDelete("restrict"),
    check("concept_maps_nodes_ck", sql`jsonb_typeof(${t.nodes}) = 'array'`),
    check("concept_maps_final_ck", sql`NOT ${t.isFinal} OR ${t.submittedAt} IS NOT NULL`),
    check("concept_maps_revision_ck", sql`${t.revision} > 0`),
  ],
);

export const conceptMapEdges = pgTable(
  "concept_map_edges",
  {
    id: pk(),
    conceptMapId: uuid()
      .notNull()
      .references(() => conceptMaps.id, { onDelete: "cascade" }),
    edgeKey: text().notNull(),
    sourceNodeKey: text().notNull(),
    targetNodeKey: text().notNull(),
    sourceConceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    targetConceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    relationshipTypeCode: text().references(() => relationshipTypes.code, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    /** Free-text label typed by the participant, if the editor allows it. */
    label: text(),
    directed: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    unique("concept_map_edges_key_uq").on(t.conceptMapId, t.edgeKey),
    check("concept_map_edges_self_ck", sql`${t.sourceNodeKey} <> ${t.targetNodeKey}`),
    index("concept_map_edges_concepts_idx").on(t.sourceConceptId, t.targetConceptId),
  ],
);

/**
 * Append-only history of a participant concept map: one row per saved revision (autosave or
 * final submission), written by trigger from `concept_maps`. `raw` is the full editor state,
 * including edges, so the exact structure at every revision can be reconstructed.
 */
export const conceptMapRevisions = pgTable(
  "concept_map_revisions",
  {
    id: pk(),
    conceptMapId: uuid()
      .notNull()
      .references(() => conceptMaps.id, { onDelete: "restrict" }),
    revision: integer().notNull(),
    nodes: jsonb().notNull(),
    raw: jsonb().notNull(),
    isFinal: boolean().notNull(),
    savedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    unique("concept_map_revisions_uq").on(t.conceptMapId, t.revision),
    check("concept_map_revisions_revision_ck", sql`${t.revision} > 0`),
  ],
);

/** Versioned scores derived from raw responses / concept maps. */
export const derivedScores = pgTable(
  "derived_scores",
  {
    id: pk(),
    sessionId: uuid().notNull(),
    participantId: uuid().notNull(),
    assessmentId: uuid()
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    conceptMapId: uuid().references(() => conceptMaps.id, { onDelete: "restrict" }),
    responseId: uuid().references(() => responses.id, { onDelete: "restrict" }),
    referenceMapId: uuid().references(() => referenceMaps.id, { onDelete: "restrict" }),
    rubricId: uuid().references(() => scoringRubrics.id, { onDelete: "restrict" }),
    metricName: text().notNull(),
    metricVersion: text().notNull(),
    value: doublePrecision(),
    details: jsonb().notNull().default(sql`'{}'::jsonb`),
    pipelineVersion: text().notNull(),
    computedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    unique("derived_scores_uq")
      .on(
        t.sessionId,
        t.assessmentId,
        t.conceptMapId,
        t.responseId,
        t.referenceMapId,
        t.rubricId,
        t.metricName,
        t.metricVersion,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "derived_scores_session_fk",
      columns: [t.sessionId, t.participantId],
      foreignColumns: [studySessions.id, studySessions.participantId],
    }).onDelete("restrict"),
    check("derived_scores_metric_ck", sql`${t.metricName} ~ '^[a-z][a-z0-9_.]{0,63}$'`),
  ],
);
