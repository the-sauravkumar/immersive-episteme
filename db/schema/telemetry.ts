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
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  SHA256_HEX_RE,
  batchStatusEnum,
  createdAt,
  eventScopeEnum,
  pk,
  sequenceAnomalyKindEnum,
  tsz,
} from "./_common";
import { concepts, knowledgeCategories, traditions } from "./knowledge";
import { contentSnapshots } from "./publishing";
import { studySessions } from "./study";

export const eventTypes = pgTable(
  "event_types",
  {
    code: text().primaryKey(),
    label: text().notNull(),
    description: text().notNull(),
    requirementRefs: text().array().notNull().default(sql`'{}'::text[]`),
    analyticConcept: text().notNull(),
    scope: eventScopeEnum().notNull().default("both"),
    schemaVersion: smallint().notNull().default(1),
    isTechnical: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check("event_types_code_ck", sql`${t.code} ~ '^[a-z][a-z0-9_]{1,63}$'`),
    check("event_types_concept_ck", sql`${t.analyticConcept} ~ '^[a-z][a-z0-9_]{1,63}$'`),
  ],
);

export const telemetryBatches = pgTable(
  "telemetry_batches",
  {
    id: pk(),
    idempotencyKey: text().notNull().unique(),
    sessionId: uuid()
      .notNull()
      .references(() => studySessions.id, { onDelete: "restrict" }),
    schemaVersion: smallint().notNull(),
    appBuild: text().notNull(),
    clientSentAt: tsz(),
    receivedAt: tsz().notNull().defaultNow(),
    eventCount: integer().notNull(),
    acceptedCount: integer().notNull().default(0),
    duplicateCount: integer().notNull().default(0),
    quarantinedCount: integer().notNull().default(0),
    status: batchStatusEnum().notNull(),
    payloadSha256: text(),
  },
  (t) => [
    check("telemetry_batches_key_ck", sql`${t.idempotencyKey} ~ '^[A-Za-z0-9_:.-]{8,128}$'`),
    check(
      "telemetry_batches_counts_ck",
      sql`${t.eventCount} >= 0 AND ${t.acceptedCount} >= 0 AND ${t.duplicateCount} >= 0 AND ${t.quarantinedCount} >= 0 AND ${t.acceptedCount} + ${t.duplicateCount} + ${t.quarantinedCount} = ${t.eventCount}`,
    ),
    check(
      "telemetry_batches_sha_ck",
      sql`${t.payloadSha256} IS NULL OR ${t.payloadSha256} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`,
    ),
    index("telemetry_batches_session_idx").on(t.sessionId, t.receivedAt),
    index("telemetry_batches_duplicates_idx").on(t.sessionId).where(sql`${t.duplicateCount} > 0`),
  ],
);

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: pk(),
    eventId: uuid().notNull().unique(),
    batchId: uuid().references(() => telemetryBatches.id, { onDelete: "restrict" }),
    schemaVersion: smallint().notNull(),
    studyId: uuid().notNull(),
    participantId: uuid().notNull(),
    sessionId: uuid().notNull(),
    conditionId: uuid().notNull(),
    clientTs: tsz().notNull(),
    clientMonoMs: doublePrecision(),
    serverTs: tsz().notNull().defaultNow(),
    seq: integer().notNull(),
    eventTypeCode: text()
      .notNull()
      .references(() => eventTypes.code, { onDelete: "restrict", onUpdate: "cascade" }),
    conceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    categoryCode: text().references(() => knowledgeCategories.code, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    traditionId: uuid().references(() => traditions.id, { onDelete: "restrict" }),
    roomOrPageId: text(),
    target: text(),
    metadata: jsonb().notNull().default(sql`'{}'::jsonb`),
    appBuild: text().notNull(),
    contentVersion: text().notNull(),
    snapshotId: uuid().references(() => contentSnapshots.id, { onDelete: "restrict" }),
    compilerVersion: text(),
  },
  (t) => [
    unique("telemetry_events_session_seq_uq").on(t.sessionId, t.seq),
    foreignKey({
      name: "telemetry_events_session_fk",
      columns: [t.sessionId, t.studyId, t.participantId, t.conditionId],
      foreignColumns: [
        studySessions.id,
        studySessions.studyId,
        studySessions.participantId,
        studySessions.conditionId,
      ],
    }).onDelete("restrict"),
    check("telemetry_events_seq_ck", sql`${t.seq} >= 0`),
    check("telemetry_events_metadata_ck", sql`jsonb_typeof(${t.metadata}) = 'object'`),
    index("telemetry_events_study_type_idx").on(t.studyId, t.eventTypeCode),
    index("telemetry_events_concept_idx").on(t.conceptId),
    index("telemetry_events_server_ts_idx").on(t.serverTs),
    index("telemetry_events_study_server_ts_idx").on(t.studyId, t.serverTs),
  ],
);

export const telemetryQuarantine = pgTable(
  "telemetry_quarantine",
  {
    id: pk(),
    batchId: uuid().references(() => telemetryBatches.id, { onDelete: "restrict" }),
    sessionId: uuid().references(() => studySessions.id, { onDelete: "restrict" }),
    eventId: uuid(),
    reason: text().notNull(),
    raw: jsonb().notNull(),
    receivedAt: tsz().notNull().defaultNow(),
    resolvedAt: tsz(),
    resolution: text(),
  },
  (t) => [index("telemetry_quarantine_session_idx").on(t.sessionId, t.receivedAt)],
);

export const sequenceGaps = pgTable(
  "sequence_gaps",
  {
    id: pk(),
    sessionId: uuid()
      .notNull()
      .references(() => studySessions.id, { onDelete: "restrict" }),
    kind: sequenceAnomalyKindEnum().notNull(),
    fromSeq: integer().notNull(),
    toSeq: integer().notNull(),
    detectedAt: tsz().notNull().defaultNow(),
    resolvedAt: tsz(),
    details: jsonb().notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    unique("sequence_gaps_uq").on(t.sessionId, t.kind, t.fromSeq),
    check("sequence_gaps_range_ck", sql`${t.fromSeq} >= 0 AND ${t.toSeq} >= ${t.fromSeq}`),
  ],
);

export const derivedMetrics = pgTable(
  "derived_metrics",
  {
    id: pk(),
    studyId: uuid().notNull(),
    participantId: uuid().notNull(),
    sessionId: uuid().notNull(),
    conditionId: uuid().notNull(),
    metricName: text().notNull(),
    metricVersion: text().notNull(),
    value: doublePrecision(),
    details: jsonb().notNull().default(sql`'{}'::jsonb`),
    inputEventCount: integer().notNull(),
    inputSha256: text().notNull(),
    pipelineVersion: text().notNull(),
    computedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    unique("derived_metrics_uq").on(t.sessionId, t.metricName, t.metricVersion),
    foreignKey({
      name: "derived_metrics_session_fk",
      columns: [t.sessionId, t.studyId, t.participantId, t.conditionId],
      foreignColumns: [
        studySessions.id,
        studySessions.studyId,
        studySessions.participantId,
        studySessions.conditionId,
      ],
    }).onDelete("restrict"),
    check("derived_metrics_metric_ck", sql`${t.metricName} ~ '^[a-z][a-z0-9_.]{0,63}$'`),
    check("derived_metrics_sha_ck", sql`${t.inputSha256} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`),
    check("derived_metrics_count_ck", sql`${t.inputEventCount} >= 0`),
  ],
);

export const sessionTelemetryRollups = pgTable(
  "session_telemetry_rollups",
  {
    sessionId: uuid()
      .primaryKey()
      .references(() => studySessions.id, { onDelete: "restrict" }),
    studyId: uuid().notNull(),
    metricsVersion: text().notNull(),
    sessionStatus: text().notNull(),
    lastSeq: integer().notNull(),
    eventCount: integer().notNull(),
    stageMs: doublePrecision().notNull(),
    stopsVisited: integer().notNull(),
    revisits: integer().notNull(),
    backSteps: integer().notNull(),
    sourcesOpened: integer().notNull(),
    pauseMs: doublePrecision().notNull(),
    clientErrors: integer().notNull(),
    computedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    index("session_telemetry_rollups_study_idx").on(t.studyId),
    check("session_telemetry_rollups_counts_ck", sql`${t.eventCount} >= 0 AND ${t.lastSeq} >= -1`),
  ],
);
