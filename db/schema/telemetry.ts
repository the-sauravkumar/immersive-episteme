/**
 * Telemetry: one event contract for both conditions.
 *
 * - event_types: registry of raw event types. Each maps to a shared `analytic_concept`
 *   (e.g. `room_entered` (3D) and `page_entered` (2D) both map to
 *   `knowledge_domain_accessed`), so the conditions remain comparable.
 * - telemetry_batches: client upload batches; `idempotency_key` is UNIQUE, so a retried
 *   upload is recognised instead of double-counted.
 * - telemetry_events: raw events, append-only (UPDATE always rejected; DELETE only inside an
 *   explicit, reasoned purge, see migration 0003). `event_id` (client uuid) is UNIQUE and
 *   (session_id, seq) is UNIQUE, so duplicates are impossible and ordering is reconstructible.
 *   A composite FK pins study/participant/condition to the session's own values.
 * - telemetry_quarantine: unknown types / invalid events are kept, never silently dropped.
 * - sequence_gaps: detected gaps, duplicates and out-of-order arrivals per session.
 * - derived_metrics: versioned computations, kept apart from the raw events.
 * - session_telemetry_rollups: per-session read model of the research dashboard (time accounting
 *   and interaction counts), recomputed from the raw events only when a session has new events
 *   (src/server/research/dashboard-rollups.ts). A cache of derived values, never source data.
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
    /** Requirement ids this type serves (EVT-01 .. EVT-14). */
    requirementRefs: text().array().notNull().default(sql`'{}'::text[]`),
    /** Shared analytical concept used to compare the two conditions. */
    analyticConcept: text().notNull(),
    scope: eventScopeEnum().notNull().default("both"),
    schemaVersion: smallint().notNull().default(1),
    /** Lifecycle/technical events (not learner behaviour) are excluded from behaviour metrics. */
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
    /** Research dashboard: the few batches that carried duplicates, without scanning all batches. */
    index("telemetry_batches_duplicates_idx").on(t.sessionId).where(sql`${t.duplicateCount} > 0`),
  ],
);

export const telemetryEvents = pgTable(
  "telemetry_events",
  {
    id: pk(),
    /** Client-generated uuid; globally unique (deduplication key). */
    eventId: uuid().notNull().unique(),
    batchId: uuid().references(() => telemetryBatches.id, { onDelete: "restrict" }),
    schemaVersion: smallint().notNull(),
    studyId: uuid().notNull(),
    participantId: uuid().notNull(),
    sessionId: uuid().notNull(),
    conditionId: uuid().notNull(),
    clientTs: tsz().notNull(),
    /** performance.now() at emission: monotonic within a page load. */
    clientMonoMs: doublePrecision(),
    serverTs: tsz().notNull().defaultNow(),
    /** Per-session monotonically increasing sequence number assigned by the client. */
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
    /** Room id (3D) or page/route id (2D). */
    roomOrPageId: text(),
    /** Interaction target (exhibit/element id, link id, button id). */
    target: text(),
    metadata: jsonb().notNull().default(sql`'{}'::jsonb`),
    appBuild: text().notNull(),
    /** Content snapshot version label the client was rendering. */
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
    /** Research dashboard change detection: latest event of a study in O(log n). */
    index("telemetry_events_study_server_ts_idx").on(t.studyId, t.serverTs),
  ],
);

/** Events that could not be accepted (unknown type, schema violation, seq conflict). */
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

/** Versioned behavioural metrics, recomputable from the raw events. */
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
    /** sha256 over the ordered (event_id, seq) list used, to detect stale metrics. */
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

/**
 * Research-dashboard rollup of one session's telemetry (src/server/research/dashboard-rollups.ts).
 * Derived, recomputable from telemetry_events at any time with the same pure function; a row is
 * current when `metrics_version` matches, the session's max(seq) equals `last_seq` and, for a
 * session still open, its event count equals `event_count`.
 */
export const sessionTelemetryRollups = pgTable(
  "session_telemetry_rollups",
  {
    sessionId: uuid()
      .primaryKey()
      .references(() => studySessions.id, { onDelete: "restrict" }),
    studyId: uuid().notNull(),
    metricsVersion: text().notNull(),
    /** Session status when computed: an ended session with unchanged max(seq) is never recomputed. */
    sessionStatus: text().notNull(),
    /** max(seq) of the session's events when computed; -1 when it had none. */
    lastSeq: integer().notNull(),
    eventCount: integer().notNull(),
    exposureMs: doublePrecision().notNull(),
    navigationMs: doublePrecision().notNull(),
    pauseMs: doublePrecision().notNull(),
    unterminated: integer().notNull(),
    conceptsExposed: integer().notNull(),
    conceptsInScope: integer().notNull(),
    relationshipsFollowed: integer().notNull(),
    citationOpens: integer().notNull(),
    guidanceUses: integer().notNull(),
    webglContextLost: integer().notNull(),
    clientErrors: integer().notNull(),
    computedAt: tsz().notNull().defaultNow(),
  },
  (t) => [
    index("session_telemetry_rollups_study_idx").on(t.studyId),
    check("session_telemetry_rollups_counts_ck", sql`${t.eventCount} >= 0 AND ${t.lastSeq} >= -1`),
  ],
);
