/**
 * Telemetry contracts: one event envelope for both learning conditions (spec §10.2) and the
 * raw event-type registry (spec §10.1, EVT-01..EVT-14 in the requirements digest).
 *
 * Raw types may differ per interface (`room_entered` in 3D, `page_entered` in 2D) but each
 * maps to a shared `analyticConcept` (`knowledge_domain_accessed`) so the conditions stay
 * comparable. The registry below is seeded into `event_types` (db/seeds/reference.ts); the
 * database rejects an event whose scope does not match the session's condition interface.
 *
 * Open questions that affect this registry: Q-R6 (which query affordance exists, EVT-06) and
 * Q-R18 (what counts as an abandoned/incorrect pathway, EVT-11).
 */
import { z } from "zod";

import { EVENT_SCOPES, KNOWLEDGE_CATEGORY_CODES, type EventScope } from "@/lib/validation/enums";
import { jsonObjectSchema, relationshipTypeCodeSchema, sha256Schema, uuidSchema } from "@/lib/validation/primitives";

export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const MAX_EVENTS_PER_BATCH = 500;

export type EventTypeDefinition = {
  code: string;
  label: string;
  description: string;
  analyticConcept: string;
  scope: EventScope;
  requirementRefs: readonly string[];
  isTechnical?: boolean;
};

export const EVENT_TYPE_REGISTRY = [
  // EVT-01 / EVT-02: entering and leaving a knowledge domain (room or page) with timestamps.
  { code: "room_entered", label: "Room entered", description: "The participant entered a museum room or zone (3D).", analyticConcept: "knowledge_domain_accessed", scope: "immersive_3d", requirementRefs: ["EVT-01", "EVT-02"] },
  { code: "room_exited", label: "Room exited", description: "The participant left a museum room or zone (3D).", analyticConcept: "knowledge_domain_left", scope: "immersive_3d", requirementRefs: ["EVT-02"] },
  { code: "page_entered", label: "Page entered", description: "The participant opened a knowledge page (2D).", analyticConcept: "knowledge_domain_accessed", scope: "conventional_2d", requirementRefs: ["EVT-01", "EVT-02"] },
  { code: "page_exited", label: "Page exited", description: "The participant left a knowledge page (2D).", analyticConcept: "knowledge_domain_left", scope: "conventional_2d", requirementRefs: ["EVT-02"] },
  // EVT-03: object selection.
  { code: "exhibit_selected", label: "Exhibit selected", description: "The participant selected an exhibit or object (3D).", analyticConcept: "knowledge_object_selected", scope: "immersive_3d", requirementRefs: ["EVT-03"] },
  { code: "content_item_selected", label: "Content item selected", description: "The participant selected a concept card, figure or list item (2D).", analyticConcept: "knowledge_object_selected", scope: "conventional_2d", requirementRefs: ["EVT-03"] },
  // EVT-04 / EVT-05: information layers.
  { code: "information_layer_opened", label: "Information layer opened", description: "A detail layer (panel, dialog, expandable section) was opened.", analyticConcept: "information_layer_opened", scope: "both", requirementRefs: ["EVT-04"] },
  { code: "information_layer_closed", label: "Information layer closed", description: "A detail layer was closed.", analyticConcept: "information_layer_closed", scope: "both", requirementRefs: ["EVT-04"] },
  { code: "knowledge_layer_selected", label: "Knowledge layer selected", description: "The artisan, process or science layer was selected (metadata.layer).", analyticConcept: "knowledge_layer_selected", scope: "both", requirementRefs: ["EVT-05"] },
  // EVT-06: query (affordance pending Q-R6).
  { code: "query_submitted", label: "Query submitted", description: "The participant submitted a query (affordance pending Q-R6).", analyticConcept: "query_asked", scope: "both", requirementRefs: ["EVT-06"] },
  // EVT-07: interaction sequence = ordered `seq`; relationship traversal is logged explicitly.
  { code: "relationship_followed", label: "Relationship followed", description: "The participant moved along a typed relationship (link in 2D, path or portal in 3D).", analyticConcept: "relationship_traversed", scope: "both", requirementRefs: ["EVT-07", "EVT-14"] },
  // EVT-08 / EVT-14: returns and repeats.
  { code: "item_revisited", label: "Item revisited", description: "The participant returned to an object, page or room seen earlier in the session.", analyticConcept: "revisit", scope: "both", requirementRefs: ["EVT-08", "EVT-14"] },
  // EVT-09: crossing between traditions.
  { code: "tradition_crossed", label: "Tradition crossed", description: "The participant moved from one tradition's content to another's.", analyticConcept: "cross_tradition_movement", scope: "both", requirementRefs: ["EVT-09"] },
  // EVT-10: guidance (policy pending Q-R5).
  { code: "guidance_cue_used", label: "Guidance cue used", description: "A guidance cue was shown and followed or dismissed (metadata.action).", analyticConcept: "guidance_used", scope: "both", requirementRefs: ["EVT-10"] },
  // EVT-11: abandoned or incorrect pathway (definition pending Q-R18).
  { code: "pathway_abandoned", label: "Pathway abandoned", description: "A started pathway was left before its end (definition pending Q-R18).", analyticConcept: "pathway_abandoned", scope: "both", requirementRefs: ["EVT-11"] },
  // EVT-12: task timing.
  { code: "task_started", label: "Task started", description: "A learning or assessment task started.", analyticConcept: "task_started", scope: "both", requirementRefs: ["EVT-12"] },
  { code: "task_completed", label: "Task completed", description: "A learning or assessment task completed.", analyticConcept: "task_completed", scope: "both", requirementRefs: ["EVT-12"] },
  // EVT-13: first exposure to a concept (unique counts are derived).
  { code: "concept_encountered", label: "Concept encountered", description: "A concept became visible or was opened (metadata.mode = seen | opened).", analyticConcept: "concept_encountered", scope: "both", requirementRefs: ["EVT-13"] },
  // Time accounting (lead requirement: equal exposure across conditions; navigation time kept
  // apart from learning). Every moment of a learning session is EITHER content exposure OR
  // navigation OR paused/idle, never two at once: the client time accountant
  // (src/features/telemetry/client/timing.ts) holds one open interval at a time. Durations are
  // measured with performance.now() and exclude paused time. These are telemetry only: derived
  // metrics may aggregate them; learning-outcome tables (responses, derived_scores) never hold them.
  { code: "exposure_started", label: "Content exposure started", description: "A concept's content became visible: 2D concept page in view, or 3D information panel open (metadata.layer).", analyticConcept: "content_exposure", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "exposure_ended", label: "Content exposure ended", description: "The concept content interval ended; metadata carries start/end on the monotonic clock, active and paused milliseconds.", analyticConcept: "content_exposure", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "navigation_started", label: "Navigation started", description: "The participant is moving or browsing with no concept content open (3D walking, 2D menus or catalogue).", analyticConcept: "navigation", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "navigation_ended", label: "Navigation ended", description: "The navigation interval ended; metadata carries start/end on the monotonic clock, active and paused milliseconds.", analyticConcept: "navigation", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "timing_paused", label: "Timing paused", description: "Interval timing paused: tab hidden, window blurred or a non-content modal opened (metadata.cause, metadata.intervalKind).", analyticConcept: "timing_pause", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "timing_resumed", label: "Timing resumed", description: "Interval timing resumed after a pause (metadata.pausedMs).", analyticConcept: "timing_pause", scope: "both", requirementRefs: [], isTechnical: true },
  // Optional citation use (citations never obstruct the primary learning path).
  { code: "citation_opened", label: "Citation opened", description: "The participant opened the source citation of a claim (metadata.sourceId, metadata.claimIndex).", analyticConcept: "citation_used", scope: "both", requirementRefs: [] },
  { code: "citation_closed", label: "Citation closed", description: "The citation was closed (metadata.openMs).", analyticConcept: "citation_used", scope: "both", requirementRefs: [] },
  // Technical / lifecycle events: excluded from behavioural metrics, used for data quality.
  { code: "session_started", label: "Session started", description: "The learning session started on this client.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "session_resumed", label: "Session resumed", description: "The session resumed after an interruption or reload.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "session_ended", label: "Session ended", description: "The learning session ended on this client.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "visibility_changed", label: "Visibility changed", description: "The tab was hidden or shown (metadata.visible).", analyticConcept: "attention_interrupted", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "render_quality_changed", label: "Render quality changed", description: "The 3D quality tier changed (metadata.from, metadata.to).", analyticConcept: "runtime_quality", scope: "immersive_3d", requirementRefs: [], isTechnical: true },
  { code: "webgl_context_lost", label: "WebGL context lost", description: "The 3D renderer lost its WebGL context.", analyticConcept: "runtime_failure", scope: "immersive_3d", requirementRefs: [], isTechnical: true },
  { code: "client_error", label: "Client error", description: "An uncaught client error (message hash only, no user data).", analyticConcept: "runtime_failure", scope: "both", requirementRefs: [], isTechnical: true },
] as const satisfies readonly EventTypeDefinition[];

export type EventTypeCode = (typeof EVENT_TYPE_REGISTRY)[number]["code"];
export const EVENT_TYPE_CODES = EVENT_TYPE_REGISTRY.map((e) => e.code) as [EventTypeCode, ...EventTypeCode[]];
export const eventTypeCodeSchema = z.enum(EVENT_TYPE_CODES);
export const eventScopeSchema = z.enum(EVENT_SCOPES);

// ---------------------------------------------------------------------------------------
// Event metadata: an explicit allowlist of keys per event type
// ---------------------------------------------------------------------------------------
//
// Every event type declares exactly which metadata keys it may carry (strict objects: an
// unknown key is rejected). This replaces a key-name denylist, which both rejected legitimate
// keys by substring (relationsh-IP-Id, descr-IP-tion, layer-NAME) and let any value through.
// Values are typed and bounded; free text is never accepted (no query text, no error
// messages: those are hashed), so metadata cannot carry personal data.

const shortCode = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/, "Expected a short identifier");
const durationMs = z.number().int().nonnegative().max(24 * 60 * 60 * 1000);
const count = z.number().int().nonnegative().max(100_000);
const domainEntry = { fromId: shortCode.optional(), via: z.enum(["navigation", "link", "portal", "search", "guidance", "start", "resume"]).optional() };

/**
 * What part of a concept's content is showing during an exposure interval. `comparison`: a
 * cross-tradition comparison concept (both conditions, by concept type). `citation` is reserved
 * for a separate citation interval; today an opened citation stays inside the concept's exposure
 * (citation_opened / citation_closed events, data-and-telemetry-layer §4c), so no client emits it.
 */
export const EXPOSURE_LAYERS = ["overview", "artisan", "process", "science", "comparison", "citation"] as const;
const exposureLayer = z.enum(EXPOSURE_LAYERS);
export type ExposureLayer = (typeof EXPOSURE_LAYERS)[number];
/** Where navigation happens (3D: walk; 2D: menu, catalogue, map, search results). */
export const NAVIGATION_SURFACES = ["walk", "menu", "catalogue", "map", "search"] as const;
const navigationSurface = z.enum(NAVIGATION_SURFACES);
export type NavigationSurface = (typeof NAVIGATION_SURFACES)[number];
const monoMs = z.number().nonnegative();
/** Why timing is paused: tab hidden, window lost focus, or a non-content modal is open. */
export const PAUSE_CAUSES = ["hidden", "blur", "modal"] as const;
export type PauseCause = (typeof PAUSE_CAUSES)[number];
const pauseCause = z.enum(PAUSE_CAUSES);
/** End of an interval: monotonic start/end, active (unpaused) and paused time, why it ended. */
const intervalEnd = {
  startMonoMs: monoMs,
  endMonoMs: monoMs,
  activeMs: durationMs,
  pausedMs: durationMs,
  reason: z.enum(["switched", "closed", "exit", "budget_ended"]),
};

/**
 * Interval events. Only the client time accountant (src/features/telemetry/client/timing.ts)
 * emits them, so one moment can never be counted as both exposure and navigation; the public
 * `track` and the typed helpers refuse them.
 */
export const TIMING_EVENT_TYPES = ["exposure_started", "exposure_ended", "navigation_started", "navigation_ended", "timing_paused", "timing_resumed"] as const;
export type TimingEventTypeCode = (typeof TIMING_EVENT_TYPES)[number];

/** Event types that must carry `conceptId` (time and citations are attributed to a concept). */
export const CONCEPT_REQUIRED_EVENT_TYPES = ["exposure_started", "exposure_ended", "citation_opened", "citation_closed"] as const;

/** Allowed metadata per event type (all keys optional unless stated). */
export const EVENT_METADATA_SCHEMAS = {
  room_entered: z.strictObject(domainEntry),
  room_exited: z.strictObject({ dwellMs: durationMs.optional() }),
  page_entered: z.strictObject(domainEntry),
  page_exited: z.strictObject({ dwellMs: durationMs.optional(), scrollDepth: z.number().min(0).max(1).optional() }),
  exhibit_selected: z.strictObject({ elementKind: shortCode.optional() }),
  content_item_selected: z.strictObject({ elementKind: shortCode.optional() }),
  information_layer_opened: z.strictObject({ layerId: shortCode.optional() }),
  information_layer_closed: z.strictObject({ layerId: shortCode.optional(), openMs: durationMs.optional() }),
  knowledge_layer_selected: z.strictObject({ layer: z.enum(["artisan", "process", "science"]) }),
  // Query text is never logged (Q-R6 pending): only its shape.
  query_submitted: z.strictObject({ queryLength: count.optional(), resultCount: count.optional() }),
  relationship_followed: z.strictObject({
    relationshipId: uuidSchema,
    relationshipTypeCode: relationshipTypeCodeSchema,
    fromConceptId: uuidSchema.optional(),
    toConceptId: uuidSchema.optional(),
    direction: z.enum(["forward", "inverse"]).optional(),
  }),
  item_revisited: z.strictObject({ itemKind: z.enum(["concept", "room", "page", "exhibit"]).optional(), visitCount: count.optional() }),
  tradition_crossed: z.strictObject({ fromTraditionId: uuidSchema.optional(), toTraditionId: uuidSchema.optional() }),
  guidance_cue_used: z.strictObject({ action: z.enum(["shown", "followed", "dismissed"]), cueId: shortCode.optional() }),
  pathway_abandoned: z.strictObject({ pathwayId: shortCode.optional(), stepsCompleted: count.optional() }),
  task_started: z.strictObject({ taskCode: shortCode.optional() }),
  task_completed: z.strictObject({ taskCode: shortCode.optional(), durationMs: durationMs.optional() }),
  concept_encountered: z.strictObject({ mode: z.enum(["seen", "opened"]) }),
  exposure_started: z.strictObject({ intervalId: shortCode, layer: exposureLayer, startMonoMs: monoMs }),
  exposure_ended: z.strictObject({ intervalId: shortCode, layer: exposureLayer, ...intervalEnd }),
  navigation_started: z.strictObject({ intervalId: shortCode, surface: navigationSurface.optional(), startMonoMs: monoMs }),
  navigation_ended: z.strictObject({ intervalId: shortCode, surface: navigationSurface.optional(), ...intervalEnd }),
  timing_paused: z.strictObject({ intervalId: shortCode.optional(), intervalKind: z.enum(["exposure", "navigation", "none"]), cause: pauseCause }),
  timing_resumed: z.strictObject({
    intervalId: shortCode.optional(),
    intervalKind: z.enum(["exposure", "navigation", "none"]),
    pausedMs: durationMs,
    /** Every cause that was active during the pause. */
    causes: z.array(pauseCause).min(1).max(PAUSE_CAUSES.length).optional(),
  }),
  citation_opened: z.strictObject({ sourceId: uuidSchema, claimIndex: count }),
  citation_closed: z.strictObject({ sourceId: uuidSchema, claimIndex: count, openMs: durationMs.optional() }),
  session_started: z.strictObject({}),
  session_resumed: z.strictObject({ gapMs: durationMs.optional() }),
  session_ended: z.strictObject({ reason: z.enum(["completed", "timeout", "user_exit", "error"]).optional() }),
  visibility_changed: z.strictObject({ visible: z.boolean() }),
  render_quality_changed: z.strictObject({ from: shortCode, to: shortCode }),
  webgl_context_lost: z.strictObject({}),
  client_error: z.strictObject({ messageSha256: sha256Schema, source: z.enum(["window", "promise", "react", "worker"]).optional() }),
} as const satisfies Record<EventTypeCode, z.ZodType>;

export const MAX_METADATA_BYTES = 4096;

/** One event as emitted by the client. Server-side fields (server_ts, batch) are added on ingest. */
export const telemetryEventSchema = z
  .object({
    eventId: uuidSchema,
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    sessionId: uuidSchema,
    seq: z.number().int().min(0),
    type: eventTypeCodeSchema,
    clientTs: z.iso.datetime({ offset: true }),
    clientMonoMs: z.number().nonnegative().optional(),
    conceptId: uuidSchema.optional(),
    category: z.enum(KNOWLEDGE_CATEGORY_CODES).optional(),
    traditionId: uuidSchema.optional(),
    roomOrPageId: z.string().min(1).max(200).optional(),
    target: z.string().min(1).max(200).optional(),
    metadata: jsonObjectSchema.default({}),
  })
  .superRefine((e, ctx) => {
    if (JSON.stringify(e.metadata).length > MAX_METADATA_BYTES) {
      ctx.addIssue({ code: "custom", path: ["metadata"], message: "metadata is limited to 4 KiB" });
      return;
    }
    if ((CONCEPT_REQUIRED_EVENT_TYPES as readonly string[]).includes(e.type) && !e.conceptId) {
      ctx.addIssue({ code: "custom", path: ["conceptId"], message: `${e.type} needs conceptId` });
    }
    if (e.type === "exposure_ended" || e.type === "navigation_ended") {
      const m = e.metadata as { startMonoMs?: number; endMonoMs?: number; activeMs?: number; pausedMs?: number };
      if (typeof m.startMonoMs === "number" && typeof m.endMonoMs === "number" && typeof m.activeMs === "number" && typeof m.pausedMs === "number") {
        const span = m.endMonoMs - m.startMonoMs;
        if (span < 0 || m.activeMs + m.pausedMs > Math.ceil(span) + 1) {
          ctx.addIssue({ code: "custom", path: ["metadata"], message: "interval times are inconsistent (active + paused must fit between start and end)" });
        }
      }
    }
    const result = EVENT_METADATA_SCHEMAS[e.type].safeParse(e.metadata);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", path: ["metadata", ...issue.path.map(String)], message: `${e.type}: ${issue.message}` });
      }
    }
  });
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

/**
 * Upload batch. `idempotencyKey` is UNIQUE in telemetry_batches: a retried upload with the
 * same key is acknowledged without inserting again. Participant/study/condition are NOT sent
 * by the client; the server derives them from the session cookie and session row.
 */
export const telemetryBatchSchema = z
  .object({
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/),
    sessionId: uuidSchema,
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    appBuild: z.string().min(1).max(100),
    contentVersion: z.string().min(1).max(64),
    clientSentAt: z.iso.datetime({ offset: true }),
    events: z.array(telemetryEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .superRefine((b, ctx) => {
    const ids = new Set<string>();
    const seqs = new Set<number>();
    b.events.forEach((e, i) => {
      if (e.sessionId !== b.sessionId) ctx.addIssue({ code: "custom", path: ["events", i, "sessionId"], message: "Event belongs to another session" });
      if (ids.has(e.eventId)) ctx.addIssue({ code: "custom", path: ["events", i, "eventId"], message: "Duplicate eventId in batch" });
      if (seqs.has(e.seq)) ctx.addIssue({ code: "custom", path: ["events", i, "seq"], message: "Duplicate seq in batch" });
      ids.add(e.eventId);
      seqs.add(e.seq);
    });
  });
export type TelemetryBatch = z.infer<typeof telemetryBatchSchema>;

export const telemetryBatchResultSchema = z.object({
  batchId: uuidSchema,
  status: z.enum(["accepted", "partial", "rejected"]),
  replayed: z.boolean(),
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
});
export type TelemetryBatchResult = z.infer<typeof telemetryBatchResultSchema>;

// ---------------------------------------------------------------------------------------
// Ingestion endpoint (POST /api/telemetry/batch), shared by the server route and the client
// tracker. See docs/architecture/data-and-telemetry-layer.md §4.
// ---------------------------------------------------------------------------------------

export const TELEMETRY_BATCH_ENDPOINT = "/api/telemetry/batch";
/** Request bodies above this size are refused with 413 before parsing. */
export const MAX_BATCH_BYTES = 512 * 1024;

/**
 * Batch envelope as the server first reads it: the header strictly, the events loosely, so a
 * single malformed event is quarantined instead of failing the whole upload.
 */
export const telemetryBatchEnvelopeSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/),
  sessionId: uuidSchema,
  schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
  appBuild: z.string().min(1).max(100),
  contentVersion: z.string().min(1).max(64),
  clientSentAt: z.iso.datetime({ offset: true }),
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});
export type TelemetryBatchEnvelope = z.infer<typeof telemetryBatchEnvelopeSchema>;

export const sequenceGapSchema = z.object({ fromSeq: z.number().int().min(0), toSeq: z.number().int().min(0) });

/**
 * 200 response. `persisted: false` for public-demo and staff-preview uploads (no study session
 * exists, so nothing is written to the research tables). `nonExperimental` is true for those and
 * for sessions of a demo study. `gaps` lists the missing seq ranges known after this batch.
 */
export const telemetryIngestResponseSchema = z.object({
  batchId: uuidSchema.nullable(),
  status: z.enum(["accepted", "partial", "rejected"]),
  replayed: z.boolean(),
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  persisted: z.boolean(),
  nonExperimental: z.boolean(),
  /** A participant's familiarisation practice batch (D5): acknowledged, never stored. */
  practice: z.boolean().optional(),
  gaps: z.array(sequenceGapSchema),
  serverReceivedAt: z.iso.datetime({ offset: true }),
});
export type TelemetryIngestResponse = z.infer<typeof telemetryIngestResponseSchema>;

/**
 * Error responses: `{ error: TelemetryIngestError, message }`. The client retries only 408, 429
 * (honouring Retry-After) and 5xx; any other status is final for that batch, and the tracker
 * records it as an explicit drop (never silently).
 */
export const TELEMETRY_INGEST_ERRORS = [
  "invalid_json",
  "invalid_batch",
  "payload_too_large",
  "unauthenticated",
  "session_mismatch",
  "session_closed",
  "rate_limited",
  "server_error",
] as const;
export type TelemetryIngestError = (typeof TELEMETRY_INGEST_ERRORS)[number];

/** A versioned derived metric (derived_metrics). Documented formula lives with the pipeline. */
export const derivedMetricSchema = z.object({
  sessionId: uuidSchema,
  metricName: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/),
  metricVersion: z.string().min(1).max(32),
  value: z.number().nullable(),
  details: jsonObjectSchema.default({}),
  inputEventCount: z.number().int().nonnegative(),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  pipelineVersion: z.string().min(1).max(64),
});
export type DerivedMetric = z.infer<typeof derivedMetricSchema>;
