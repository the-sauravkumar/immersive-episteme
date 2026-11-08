import { z } from "zod";

import { KNOWLEDGE_CATEGORY_CODES, type EventScope } from "@/lib/validation/enums";
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
  { code: "room_entered", label: "Room entered", description: "The participant entered a museum room or zone (3D).", analyticConcept: "knowledge_domain_accessed", scope: "immersive_3d", requirementRefs: ["EVT-01", "EVT-02"] },
  { code: "room_exited", label: "Room exited", description: "The participant left a museum room or zone (3D).", analyticConcept: "knowledge_domain_left", scope: "immersive_3d", requirementRefs: ["EVT-02"] },
  { code: "page_entered", label: "Page entered", description: "The participant opened a knowledge page (2D).", analyticConcept: "knowledge_domain_accessed", scope: "conventional_2d", requirementRefs: ["EVT-01", "EVT-02"] },
  { code: "page_exited", label: "Page exited", description: "The participant left a knowledge page (2D).", analyticConcept: "knowledge_domain_left", scope: "conventional_2d", requirementRefs: ["EVT-02"] },
  { code: "exhibit_selected", label: "Exhibit selected", description: "The participant selected an exhibit or object (3D).", analyticConcept: "knowledge_object_selected", scope: "immersive_3d", requirementRefs: ["EVT-03"] },
  { code: "content_item_selected", label: "Content item selected", description: "The participant selected a concept card, figure or list item (2D).", analyticConcept: "knowledge_object_selected", scope: "conventional_2d", requirementRefs: ["EVT-03"] },
  { code: "information_layer_opened", label: "Information layer opened", description: "A detail layer (panel, dialog, expandable section) was opened.", analyticConcept: "information_layer_opened", scope: "both", requirementRefs: ["EVT-04"] },
  { code: "information_layer_closed", label: "Information layer closed", description: "A detail layer was closed.", analyticConcept: "information_layer_closed", scope: "both", requirementRefs: ["EVT-04"] },
  { code: "knowledge_layer_selected", label: "Knowledge layer selected", description: "The artisan, process or science layer was selected (metadata.layer).", analyticConcept: "knowledge_layer_selected", scope: "both", requirementRefs: ["EVT-05"] },
  { code: "query_submitted", label: "Query submitted", description: "The participant submitted a query (affordance pending Q-R6).", analyticConcept: "query_asked", scope: "both", requirementRefs: ["EVT-06"] },
  { code: "relationship_followed", label: "Relationship followed", description: "The participant moved along a typed relationship (link in 2D, path or portal in 3D).", analyticConcept: "relationship_traversed", scope: "both", requirementRefs: ["EVT-07", "EVT-14"] },
  { code: "item_revisited", label: "Item revisited", description: "The participant returned to an object, page or room seen earlier in the session.", analyticConcept: "revisit", scope: "both", requirementRefs: ["EVT-08", "EVT-14"] },
  { code: "tradition_crossed", label: "Tradition crossed", description: "The participant moved from one tradition's content to another's.", analyticConcept: "cross_tradition_movement", scope: "both", requirementRefs: ["EVT-09"] },
  { code: "guidance_cue_used", label: "Guidance cue used", description: "A guidance cue was shown and followed or dismissed (metadata.action).", analyticConcept: "guidance_used", scope: "both", requirementRefs: ["EVT-10"] },
  { code: "pathway_abandoned", label: "Pathway abandoned", description: "A started pathway was left before its end (definition pending Q-R18).", analyticConcept: "pathway_abandoned", scope: "both", requirementRefs: ["EVT-11"] },
  { code: "task_started", label: "Task started", description: "A learning or assessment task started.", analyticConcept: "task_started", scope: "both", requirementRefs: ["EVT-12"] },
  { code: "task_completed", label: "Task completed", description: "A learning or assessment task completed.", analyticConcept: "task_completed", scope: "both", requirementRefs: ["EVT-12"] },
  { code: "concept_encountered", label: "Concept encountered", description: "A concept became visible or was opened (metadata.mode = seen | opened).", analyticConcept: "concept_encountered", scope: "both", requirementRefs: ["EVT-13"] },
  { code: "exposure_started", label: "Content exposure started", description: "A concept's KnowledgeSheet opened (or was uncovered): 2D concept page shown, or 3D information panel open; one rule in both conditions, DR-050 (metadata.layer).", analyticConcept: "content_exposure", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "exposure_ended", label: "Content exposure ended", description: "The concept content interval ended; metadata carries start/end on the monotonic clock, active and paused milliseconds.", analyticConcept: "content_exposure", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "navigation_started", label: "Navigation started", description: "The participant is moving or browsing with no concept content open (3D walking, 2D menus or catalogue).", analyticConcept: "navigation", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "navigation_ended", label: "Navigation ended", description: "The navigation interval ended; metadata carries start/end on the monotonic clock, active and paused milliseconds.", analyticConcept: "navigation", scope: "both", requirementRefs: ["EVT-02"] },
  { code: "timing_paused", label: "Timing paused", description: "Interval timing paused: tab hidden, window blurred or a non-content modal opened (metadata.cause, metadata.intervalKind).", analyticConcept: "timing_pause", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "timing_resumed", label: "Timing resumed", description: "Interval timing resumed after a pause (metadata.pausedMs).", analyticConcept: "timing_pause", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "citation_opened", label: "Citation opened", description: "The participant opened the source citation of a claim (metadata.sourceId, metadata.claimIndex).", analyticConcept: "citation_used", scope: "both", requirementRefs: [] },
  { code: "citation_closed", label: "Citation closed", description: "The citation was closed (metadata.openMs).", analyticConcept: "citation_used", scope: "both", requirementRefs: [] },
  { code: "stage_entered", label: "Stage entered", description: "The participant entered a process stage or the product stop, in either door (metadata.traditionKey, stageKey, stageNumber, visitCount, backStep).", analyticConcept: "stage_accessed", scope: "both", requirementRefs: ["NOTE-8"] },
  { code: "stage_left", label: "Stage left", description: "The participant left a stage (metadata.activeMs excludes paused time).", analyticConcept: "stage_left", scope: "both", requirementRefs: ["NOTE-8"] },
  { code: "source_opened", label: "Sources opened", description: "The participant opened the sources behind a caption or the product credits, in either door (metadata.traditionKey, stageKey, stageNumber).", analyticConcept: "source_opened", scope: "both", requirementRefs: ["NOTE-8"] },
  { code: "object_dwell", label: "Object dwell", description: "Time near one labelled object in Door 2 (metadata.objectKey, dwellMs, closestM, the approach distance).", analyticConcept: "object_dwell", scope: "immersive_3d", requirementRefs: ["NOTE-8"] },
  { code: "path_sampled", label: "Path sampled", description: "A batch of walked positions in Door 2 (metadata.points as [ms, x, z]; metadata.segment names one unbroken walk, so a new tradition or a reload starts a new one).", analyticConcept: "path", scope: "immersive_3d", requirementRefs: ["NOTE-8"] },
  { code: "viewpoint_changed", label: "Viewpoint changed", description: "Changes of view direction in Door 2 since the last report (metadata.count).", analyticConcept: "viewpoint_change", scope: "immersive_3d", requirementRefs: ["NOTE-8"] },
  { code: "wrong_turn", label: "Wrong turn", description: "The learner moved away from the next station in Door 2 (metadata.traditionKey, stageKey).", analyticConcept: "wrong_turn", scope: "immersive_3d", requirementRefs: ["NOTE-8"] },
  { code: "movement_summary", label: "Movement summary", description: "Walking time apart from viewing time at one stage in Door 2 (metadata.walkingMs, viewingMs).", analyticConcept: "movement", scope: "immersive_3d", requirementRefs: ["NOTE-8"] },
  { code: "session_started", label: "Session started", description: "The learning session started on this client.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "session_resumed", label: "Session resumed", description: "The session resumed after an interruption or reload.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "session_ended", label: "Session ended", description: "The learning session ended on this client.", analyticConcept: "session_lifecycle", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "visibility_changed", label: "Visibility changed", description: "The tab was hidden or shown (metadata.visible).", analyticConcept: "attention_interrupted", scope: "both", requirementRefs: [], isTechnical: true },
  { code: "input_method_used", label: "Input method used", description: "The participant made the first move of a navigation interval (after the scene is ready or a concept closes) or switched to another way of moving or looking in the museum (metadata.method: keys | drag | rmb | freelook | click | list; metadata.previous: the method before); consecutive uses of one method are one event.", analyticConcept: "input_method", scope: "immersive_3d", requirementRefs: [] },
  { code: "render_quality_changed", label: "Render quality changed", description: "The 3D quality tier changed (metadata.from, metadata.to).", analyticConcept: "runtime_quality", scope: "immersive_3d", requirementRefs: [], isTechnical: true },
  { code: "webgl_context_lost", label: "WebGL context lost", description: "The 3D renderer lost its WebGL context.", analyticConcept: "runtime_failure", scope: "immersive_3d", requirementRefs: [], isTechnical: true },
  { code: "client_error", label: "Client error", description: "An uncaught client error (message hash only, no user data).", analyticConcept: "runtime_failure", scope: "both", requirementRefs: [], isTechnical: true },
] as const satisfies readonly EventTypeDefinition[];

export type EventTypeCode = (typeof EVENT_TYPE_REGISTRY)[number]["code"];
export const EVENT_TYPE_CODES = EVENT_TYPE_REGISTRY.map((e) => e.code) as [EventTypeCode, ...EventTypeCode[]];
const eventTypeCodeSchema = z.enum(EVENT_TYPE_CODES);

const shortCode = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/, "Expected a short identifier");
const durationMs = z.number().int().nonnegative().max(24 * 60 * 60 * 1000);
const count = z.number().int().nonnegative().max(100_000);
const INPUT_METHODS = ["keys", "drag", "rmb", "freelook", "click", "list"] as const;
const NAVIGATION_SOURCES = ["rail", "index", "pager", "link", "close", "scene", "plan", "keyboard"] as const;
const navigationSource = z.enum(NAVIGATION_SOURCES);
const domainEntry = {
  fromId: shortCode.optional(),
  via: z.enum(["navigation", "link", "portal", "search", "guidance", "start", "resume"]).optional(),
  source: navigationSource.optional(),
};

const EXPOSURE_LAYERS = ["overview", "artisan", "process", "science", "comparison", "citation"] as const;
const exposureLayer = z.enum(EXPOSURE_LAYERS);
export type ExposureLayer = (typeof EXPOSURE_LAYERS)[number];
const NAVIGATION_SURFACES = ["walk", "menu", "catalogue", "map", "search"] as const;
const navigationSurface = z.enum(NAVIGATION_SURFACES);
export type NavigationSurface = (typeof NAVIGATION_SURFACES)[number];
const monoMs = z.number().nonnegative();
const PAUSE_CAUSES = ["hidden", "blur", "modal"] as const;
export type PauseCause = (typeof PAUSE_CAUSES)[number];
const pauseCause = z.enum(PAUSE_CAUSES);
const intervalEnd = {
  startMonoMs: monoMs,
  endMonoMs: monoMs,
  activeMs: durationMs,
  pausedMs: durationMs,
  reason: z.enum(["switched", "closed", "exit", "budget_ended"]),
};

export const TIMING_EVENT_TYPES = ["exposure_started", "exposure_ended", "navigation_started", "navigation_ended", "timing_paused", "timing_resumed"] as const;
export type TimingEventTypeCode = (typeof TIMING_EVENT_TYPES)[number];

const CONCEPT_REQUIRED_EVENT_TYPES = ["exposure_started", "exposure_ended", "citation_opened", "citation_closed"] as const;

const stageRef = { traditionKey: shortCode, stageKey: shortCode, stageNumber: z.number().int().positive().max(1000) };

export const EVENT_METADATA_SCHEMAS = {
  room_entered: z.strictObject(domainEntry),
  room_exited: z.strictObject({ dwellMs: durationMs.optional() }),
  page_entered: z.strictObject(domainEntry),
  page_exited: z.strictObject({ dwellMs: durationMs.optional(), scrollDepth: z.number().min(0).max(1).optional() }),
  exhibit_selected: z.strictObject({ elementKind: shortCode.optional(), source: navigationSource.optional() }),
  content_item_selected: z.strictObject({ elementKind: shortCode.optional(), source: navigationSource.optional() }),
  information_layer_opened: z.strictObject({ layerId: shortCode.optional() }),
  information_layer_closed: z.strictObject({ layerId: shortCode.optional(), openMs: durationMs.optional() }),
  knowledge_layer_selected: z.strictObject({ layer: z.enum(["artisan", "process", "science"]) }),
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
    causes: z.array(pauseCause).min(1).max(PAUSE_CAUSES.length).optional(),
  }),
  citation_opened: z.strictObject({ sourceId: uuidSchema, claimIndex: count }),
  citation_closed: z.strictObject({ sourceId: uuidSchema, claimIndex: count, openMs: durationMs.optional() }),
  stage_entered: z.strictObject({ ...stageRef, visitCount: count.optional(), backStep: z.boolean().optional() }),
  stage_left: z.strictObject({ ...stageRef, activeMs: durationMs }),
  source_opened: z.strictObject({ ...stageRef }),
  object_dwell: z.strictObject({ ...stageRef, objectKey: shortCode, dwellMs: durationMs, closestM: z.number().nonnegative().max(1000) }),
  path_sampled: z.strictObject({ traditionKey: shortCode, segment: shortCode.optional(), points: z.array(z.tuple([monoMs, z.number().finite(), z.number().finite()])).min(1).max(120) }),
  viewpoint_changed: z.strictObject({ traditionKey: shortCode, stageKey: shortCode, count }),
  wrong_turn: z.strictObject({ traditionKey: shortCode, stageKey: shortCode }),
  movement_summary: z.strictObject({ traditionKey: shortCode, stageKey: shortCode, walkingMs: durationMs, viewingMs: durationMs }),
  session_started: z.strictObject({}),
  session_resumed: z.strictObject({ gapMs: durationMs.optional() }),
  session_ended: z.strictObject({ reason: z.enum(["completed", "timeout", "user_exit", "error"]).optional() }),
  visibility_changed: z.strictObject({ visible: z.boolean() }),
  input_method_used: z.strictObject({ method: z.enum(INPUT_METHODS), previous: z.enum(INPUT_METHODS).optional() }),
  render_quality_changed: z.strictObject({ from: shortCode, to: shortCode }),
  webgl_context_lost: z.strictObject({}),
  client_error: z.strictObject({ messageSha256: sha256Schema, source: z.enum(["window", "promise", "react", "worker"]).optional() }),
} as const satisfies Record<EventTypeCode, z.ZodType>;

const MAX_METADATA_BYTES = 4096;

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

export const TELEMETRY_BATCH_ENDPOINT = "/api/telemetry/batch";
export const MAX_BATCH_BYTES = 512 * 1024;

export const telemetryBatchEnvelopeSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_:.-]{8,128}$/),
  sessionId: uuidSchema,
  schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
  appBuild: z.string().min(1).max(100),
  contentVersion: z.string().min(1).max(64),
  clientSentAt: z.iso.datetime({ offset: true }),
  events: z.array(z.unknown()).min(1).max(MAX_EVENTS_PER_BATCH),
});

const sequenceGapSchema = z.object({ fromSeq: z.number().int().min(0), toSeq: z.number().int().min(0) });

export const telemetryIngestResponseSchema = z.object({
  batchId: uuidSchema.nullable(),
  status: z.enum(["accepted", "partial", "rejected"]),
  replayed: z.boolean(),
  accepted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  quarantined: z.number().int().nonnegative(),
  persisted: z.boolean(),
  nonExperimental: z.boolean(),
  gaps: z.array(sequenceGapSchema),
  serverReceivedAt: z.iso.datetime({ offset: true }),
});
export type TelemetryIngestResponse = z.infer<typeof telemetryIngestResponseSchema>;
export type TelemetryIngestError = "invalid_json" | "invalid_batch" | "payload_too_large" | "unauthenticated" | "session_mismatch" | "session_closed" | "rate_limited" | "server_error";
