/**
 * Research/study domain.
 *
 * Privacy: participants carry only a pseudonymous `code` (pattern-checked so emails and
 * names with spaces cannot be stored) and an optional hashed entry token. There are NO PII
 * columns anywhere in this domain; consent wording is referenced by version + hash.
 *
 * Integrity (constraints + migration 0003 triggers):
 *  - composite FKs pin every allocation/session to conditions and participants of the SAME study;
 *  - a non-demo study can never reference a demo snapshot or manifest, and can only become
 *    active on a published snapshot (and published manifest, if any);
 *  - once active, a study's protocol inputs (snapshot, manifest, design, config, protocol
 *    version) are frozen;
 *  - sessions inherit and must match the study's snapshot/manifest, so both conditions
 *    read the same knowledge bundle;
 *  - allocations and consent records are append-only;
 *  - (0005) allocation and new sessions require the participant's latest consent decision to
 *    be `granted` and the participant not withdrawn/excluded; a within-subjects allocation
 *    records its content set, which the session copies; activation needs a `released`
 *    release manifest (if one is set), and that release is then frozen.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  SHA256_HEX_RE,
  SLUG_RE,
  actorId,
  allocationAlgorithmEnum,
  conditionInterfaceEnum,
  consentDecisionEnum,
  createdAt,
  deviationSeverityEnum,
  isDemo,
  participantStatusEnum,
  pk,
  requiredActorId,
  sessionStatusEnum,
  studyDesignEnum,
  studyStatusEnum,
  tsz,
  updatedAt,
} from "./_common";
import { contentSnapshots } from "./publishing";
import { releaseManifests } from "./release";
import { spatialManifests } from "./spatial";

export const studies = pgTable(
  "studies",
  {
    id: pk(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text(),
    protocolVersion: text().notNull(),
    snapshotId: uuid().references(() => contentSnapshots.id, { onDelete: "restrict" }),
    manifestId: uuid().references(() => spatialManifests.id, { onDelete: "restrict" }),
    releaseManifestId: uuid().references(() => releaseManifests.id, { onDelete: "restrict" }),
    design: studyDesignEnum().notNull(),
    /** Protocol as data: steps per arm, traditions, timing, guidance policy (study contracts). */
    config: jsonb().notNull().default(sql`'{}'::jsonb`),
    status: studyStatusEnum().notNull().default("draft"),
    /** Explicit researcher permission to run on a snapshot that includes unverified content. */
    allowUnverifiedContent: boolean().notNull().default(false),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    activatedBy: actorId(),
    activatedAt: tsz(),
    closedAt: tsz(),
  },
  (t) => [
    check("studies_slug_ck", sql`${t.slug} ~ ${sql.raw(`'${SLUG_RE}'`)}`),
    check(
      "studies_demo_ck",
      sql`${t.isDemo} = (${t.slug} LIKE 'demo%') AND (NOT ${t.isDemo} OR ${t.title} LIKE 'Demo:%')`,
    ),
    check(
      "studies_active_ck",
      sql`${t.status} = 'draft' OR (${t.snapshotId} IS NOT NULL AND ${t.activatedAt} IS NOT NULL)`,
    ),
    check("studies_closed_ck", sql`${t.status} <> 'closed' OR ${t.closedAt} IS NOT NULL`),
    check("studies_config_ck", sql`jsonb_typeof(${t.config}) = 'object'`),
  ],
);

export const studyConditions = pgTable(
  "study_conditions",
  {
    id: pk(),
    studyId: uuid()
      .notNull()
      .references(() => studies.id, { onDelete: "cascade" }),
    code: text().notNull(),
    label: text().notNull(),
    interface: conditionInterfaceEnum().notNull(),
    allocationWeight: smallint().notNull().default(1),
    position: smallint().notNull().default(0),
    config: jsonb().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [
    unique("study_conditions_code_uq").on(t.studyId, t.code),
    unique("study_conditions_id_study_uq").on(t.id, t.studyId),
    check("study_conditions_code_ck", sql`${t.code} ~ '^[a-z][a-z0-9_]{0,47}$'`),
    check("study_conditions_weight_ck", sql`${t.allocationWeight} > 0`),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: pk(),
    studyId: uuid()
      .notNull()
      .references(() => studies.id, { onDelete: "restrict" }),
    /** Pseudonymous study code. Never an email, name or roll number. */
    code: text().notNull(),
    /** sha256 of the one-time entry token handed to the participant (optional). */
    accessTokenHash: text().unique(),
    status: participantStatusEnum().notNull().default("enrolled"),
    stratum: text(),
    enrolledAt: tsz().notNull().defaultNow(),
    withdrawnAt: tsz(),
    withdrawalReason: text(),
    exclusionReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("participants_code_uq").on(t.studyId, t.code),
    unique("participants_id_study_uq").on(t.id, t.studyId),
    check("participants_code_ck", sql`${t.code} ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$'`),
    check(
      "participants_token_ck",
      sql`${t.accessTokenHash} IS NULL OR ${t.accessTokenHash} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`,
    ),
    check("participants_withdrawn_ck", sql`${t.status} <> 'withdrawn' OR ${t.withdrawnAt} IS NOT NULL`),
    check("participants_excluded_ck", sql`${t.status} <> 'excluded' OR ${t.exclusionReason} IS NOT NULL`),
  ],
);

/** Append-only consent history. */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: pk(),
    participantId: uuid()
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    consentVersion: text().notNull(),
    consentTextSha256: text().notNull(),
    decision: consentDecisionEnum().notNull(),
    method: text().notNull().default("on_screen"),
    recordedBy: actorId(),
    recordedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    check("consent_records_sha_ck", sql`${t.consentTextSha256} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`),
    check("consent_records_method_ck", sql`${t.method} IN ('on_screen', 'paper', 'verbal_witnessed')`),
    index("consent_records_participant_idx").on(t.participantId, t.recordedAt),
  ],
);

/** Append-only, reproducible condition assignment. */
export const allocations = pgTable(
  "allocations",
  {
    id: pk(),
    studyId: uuid().notNull(),
    participantId: uuid().notNull(),
    conditionId: uuid().notNull(),
    /** 1 for between-subjects; 1..n for within-subjects periods. */
    period: smallint().notNull().default(1),
    /**
     * Content (tradition) set the participant receives in this period, e.g. "set-a". Required
     * for within-subjects designs; must be a key of `studies.config.contentSets` when the study
     * declares them. Lets exports join outcomes to the content each participant actually saw.
     */
    contentSetCode: text(),
    /** Learning task the participant receives in this period (optional, protocol-defined). */
    taskCode: text(),
    algorithm: allocationAlgorithmEnum().notNull(),
    seed: text().notNull(),
    sequenceIndex: integer().notNull(),
    blockIndex: integer(),
    stratum: text(),
    studyProtocolVersion: text().notNull(),
    overrideReason: text(),
    allocatedBy: actorId(),
    allocatedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    unique("allocations_sequence_uq").on(t.studyId, t.sequenceIndex, t.period),
    unique("allocations_participant_period_uq").on(t.participantId, t.period),
    unique("allocations_id_participant_condition_uq").on(t.id, t.participantId, t.conditionId),
    foreignKey({
      name: "allocations_participant_fk",
      columns: [t.participantId, t.studyId],
      foreignColumns: [participants.id, participants.studyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "allocations_condition_fk",
      columns: [t.conditionId, t.studyId],
      foreignColumns: [studyConditions.id, studyConditions.studyId],
    }).onDelete("restrict"),
    check("allocations_period_ck", sql`${t.period} > 0`),
    check("allocations_sequence_ck", sql`${t.sequenceIndex} >= 0`),
    check("allocations_manual_ck", sql`${t.algorithm} <> 'manual' OR ${t.overrideReason} IS NOT NULL`),
    check("allocations_content_set_ck", sql`${t.contentSetCode} IS NULL OR ${t.contentSetCode} ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'`),
    check("allocations_task_ck", sql`${t.taskCode} IS NULL OR ${t.taskCode} ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'`),
  ],
);

export const studySessions = pgTable(
  "study_sessions",
  {
    id: pk(),
    studyId: uuid().notNull(),
    participantId: uuid().notNull(),
    /**
     * NULL until the participant is allocated (migration 0010/0011): when a study allocates after
     * the pre-test (study decision D3), the session exists from consent so the condition-blind
     * pre-allocation steps can be stored, and the allocation is attached once, later. Both are
     * set together and never change afterwards.
     */
    conditionId: uuid(),
    allocationId: uuid(),
    period: smallint().notNull().default(1),
    /** Copied from the allocation by trigger; immutable (see allocations.contentSetCode). */
    contentSetCode: text(),
    /** Copied from the allocation by trigger; immutable. */
    taskCode: text(),
    /** Filled from the study by trigger when omitted; must equal the study's. */
    snapshotId: uuid().references(() => contentSnapshots.id, { onDelete: "restrict" }),
    manifestId: uuid().references(() => spatialManifests.id, { onDelete: "restrict" }),
    /** { [assessmentId]: version } presented in this session. */
    assessmentVersions: jsonb().notNull().default(sql`'{}'::jsonb`),
    appBuild: text().notNull(),
    compilerVersion: text(),
    status: sessionStatusEnum().notNull().default("scheduled"),
    startedAt: tsz(),
    completedAt: tsz(),
    lastActivityAt: tsz(),
    /**
     * Learning clock (migration 0009), set by the server, never by the client: when the learning
     * phase started, the budget copied from the frozen study config (`exposure.mode = fixed_time`,
     * `exposure.minutes`; NULL when self-paced), when it ends (start + budget) and when it actually
     * ended. Identical budget for both conditions by design. Set-once; not a learning outcome.
     */
    learningStartedAt: tsz(),
    learningBudgetSeconds: integer(),
    learningEndsAt: tsz(),
    learningEndedAt: tsz(),
    interrupted: boolean().notNull().default(false),
    interruptionCount: integer().notNull().default(0),
    /** Covariates: viewport, input device, GPU class, quality tier, a11y settings. No fingerprinting. */
    device: jsonb().notNull().default(sql`'{}'::jsonb`),
    excluded: boolean().notNull().default(false),
    exclusionReason: text(),
    excludedBy: actorId(),
    excludedAt: tsz(),
    withdrawn: boolean().notNull().default(false),
    withdrawnAt: tsz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("study_sessions_participant_period_uq").on(t.participantId, t.period),
    unique("study_sessions_id_participant_uq").on(t.id, t.participantId),
    unique("study_sessions_identity_uq").on(t.id, t.studyId, t.participantId, t.conditionId),
    foreignKey({
      name: "study_sessions_participant_fk",
      columns: [t.participantId, t.studyId],
      foreignColumns: [participants.id, participants.studyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "study_sessions_condition_fk",
      columns: [t.conditionId, t.studyId],
      foreignColumns: [studyConditions.id, studyConditions.studyId],
    }).onDelete("restrict"),
    foreignKey({
      name: "study_sessions_allocation_fk",
      columns: [t.allocationId, t.participantId, t.conditionId],
      foreignColumns: [allocations.id, allocations.participantId, allocations.conditionId],
    }).onDelete("restrict"),
    check("study_sessions_allocated_ck", sql`(${t.conditionId} IS NULL) = (${t.allocationId} IS NULL)`),
    check("study_sessions_started_ck", sql`${t.status} = 'scheduled' OR ${t.startedAt} IS NOT NULL`),
    check(
      "study_sessions_completed_ck",
      sql`${t.status} <> 'completed' OR (${t.completedAt} IS NOT NULL AND ${t.completedAt} >= ${t.startedAt})`,
    ),
    check("study_sessions_excluded_ck", sql`NOT ${t.excluded} OR (${t.exclusionReason} IS NOT NULL AND ${t.excludedAt} IS NOT NULL)`),
    check("study_sessions_learning_budget_ck", sql`${t.learningBudgetSeconds} IS NULL OR ${t.learningBudgetSeconds} > 0`),
    check(
      "study_sessions_learning_clock_ck",
      sql`(${t.learningEndsAt} IS NULL OR ${t.learningStartedAt} IS NOT NULL) AND (${t.learningEndedAt} IS NULL OR ${t.learningEndedAt} >= ${t.learningStartedAt})`,
    ),
    check("study_sessions_withdrawn_ck", sql`NOT ${t.withdrawn} OR ${t.withdrawnAt} IS NOT NULL`),
    check("study_sessions_interruptions_ck", sql`${t.interruptionCount} >= 0 AND (${t.interrupted} OR ${t.interruptionCount} = 0)`),
    index("study_sessions_study_idx").on(t.studyId, t.status),
  ],
);

export const protocolDeviations = pgTable(
  "protocol_deviations",
  {
    id: pk(),
    studyId: uuid()
      .notNull()
      .references(() => studies.id, { onDelete: "restrict" }),
    sessionId: uuid().references(() => studySessions.id, { onDelete: "restrict" }),
    participantId: uuid().references(() => participants.id, { onDelete: "restrict" }),
    category: text().notNull(),
    severity: deviationSeverityEnum().notNull(),
    description: text().notNull(),
    resolution: text(),
    reportedBy: requiredActorId(),
    reportedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    check(
      "protocol_deviations_category_ck",
      sql`${t.category} IN ('procedure', 'technical', 'consent', 'timing', 'allocation', 'content', 'other')`,
    ),
    check("protocol_deviations_description_ck", sql`length(btrim(${t.description})) > 0`),
    index("protocol_deviations_study_idx").on(t.studyId, t.reportedAt),
  ],
);

export const sessionAnnotations = pgTable(
  "session_annotations",
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    authorId: requiredActorId(),
    kind: text().notNull().default("note"),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("session_annotations_kind_ck", sql`${t.kind} IN ('note', 'observation', 'technical_issue', 'data_quality')`),
    check("session_annotations_body_ck", sql`length(btrim(${t.body})) > 0`),
    index("session_annotations_session_idx").on(t.sessionId, t.createdAt),
  ],
);
