/**
 * Assessment and research-data contracts: instruments and items, raw responses, participant
 * concept maps, expert reference maps and versioned derived scores.
 *
 * Raw data and derived data stay separate (spec §10.3). An instrument may only be flagged as
 * validated with a name and citation (MP:593: "Do not invent a supposedly validated
 * instrument"); open instrument choices are Q-R4 and Q-R7.
 */
import { z } from "zod";

import {
  ASSESSMENT_ITEM_KINDS,
  ASSESSMENT_KINDS,
  CONCEPT_MAP_PHASES,
  RATER_ROLES,
  RESPONSE_STATUSES,
} from "@/lib/validation/enums";
import { demoConsistencyIssue, jsonObjectSchema, nonBlank, relationshipTypeCodeSchema, uuidSchema } from "@/lib/validation/primitives";

export const assessmentKindSchema = z.enum(ASSESSMENT_KINDS);
export const assessmentItemKindSchema = z.enum(ASSESSMENT_ITEM_KINDS);

export const assessmentCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/);
export const itemKeySchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);

const optionSchema = z.object({ id: z.string().min(1).max(64), label: nonBlank(500) });

/** Item configuration by kind (assessment_items.config). */
export const itemConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single_choice"), options: z.array(optionSchema).min(2), shuffle: z.boolean().default(false) }),
  z.object({ kind: z.literal("multiple_choice"), options: z.array(optionSchema).min(2), shuffle: z.boolean().default(false), maxSelections: z.number().int().positive().optional() }),
  z.object({ kind: z.literal("short_text"), maxLength: z.number().int().positive().max(2000).default(500) }),
  z.object({ kind: z.literal("long_text"), maxLength: z.number().int().positive().max(20000).default(5000) }),
  z.object({
    kind: z.literal("likert"),
    points: z.number().int().min(2).max(11),
    /** First scale value: 1 (default) or 0 (e.g. Leppink et al. 2013: 0 to 10; SSQ: 0 to 3). Values run min..min+points-1. */
    min: z.number().int().min(0).max(1).default(1),
    anchors: z.record(z.string(), z.string()).default({}),
  }),
  z.object({ kind: z.literal("numeric"), min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() }),
  z.object({ kind: z.literal("ranking"), options: z.array(optionSchema).min(2) }),
  z.object({
    kind: z.literal("concept_map"),
    /** Concept set offered to the participant (concept keys); fixed vs. per-tradition is Q-R4. */
    conceptKeys: z.array(z.string().min(1)).min(2),
    allowFreeNodes: z.boolean().default(false),
    /** Relationship types offered for typed links (empty = untyped links). */
    relationshipTypes: z.array(relationshipTypeCodeSchema).default([]),
    directed: z.boolean().default(true),
  }),
]);
export type ItemConfig = z.infer<typeof itemConfigSchema>;

export const assessmentItemInputSchema = z
  .object({
    itemKey: itemKeySchema,
    position: z.number().int().min(0),
    kind: assessmentItemKindSchema,
    prompt: nonBlank(4000),
    config: itemConfigSchema,
    answerKey: z.unknown().optional(),
    conceptId: uuidSchema.nullish(),
  })
  .refine((i) => i.config.kind === i.kind, { path: ["config", "kind"], message: "config.kind must equal kind" });
export type AssessmentItemInput = z.infer<typeof assessmentItemInputSchema>;

export const assessmentInputSchema = z
  .object({
    code: assessmentCodeSchema,
    version: z.number().int().positive(),
    kind: assessmentKindSchema,
    title: nonBlank(300),
    description: z.string().max(4000).nullish(),
    config: jsonObjectSchema.default({}),
    instrumentName: z.string().max(300).nullish(),
    instrumentCitation: z.string().max(2000).nullish(),
    isValidatedInstrument: z.boolean().default(false),
    items: z.array(assessmentItemInputSchema).default([]),
    isDemo: z.boolean().default(false),
  })
  .superRefine((a, ctx) => {
    if (a.isValidatedInstrument && !(a.instrumentName && a.instrumentCitation)) {
      ctx.addIssue({ code: "custom", path: ["instrumentCitation"], message: "A validated instrument needs its name and citation" });
    }
    const issue = demoConsistencyIssue({ isDemo: a.isDemo, slugOrKey: a.code, title: a.title });
    if (issue) ctx.addIssue({ code: "custom", path: ["isDemo"], message: issue });
    const keys = new Set<string>();
    const positions = new Set<number>();
    a.items.forEach((it, i) => {
      if (keys.has(it.itemKey)) ctx.addIssue({ code: "custom", path: ["items", i, "itemKey"], message: "Duplicate item key" });
      if (positions.has(it.position)) ctx.addIssue({ code: "custom", path: ["items", i, "position"], message: "Duplicate position" });
      keys.add(it.itemKey);
      positions.add(it.position);
    });
  });
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;

/** Raw answer as submitted (responses). */
export const responseInputSchema = z
  .object({
    sessionId: uuidSchema,
    itemId: uuidSchema,
    attempt: z.number().int().positive().default(1),
    status: z.enum(RESPONSE_STATUSES),
    raw: z.unknown().optional(),
    presentedAt: z.iso.datetime({ offset: true }).optional(),
    answeredAt: z.iso.datetime({ offset: true }).optional(),
    clientTs: z.iso.datetime({ offset: true }).optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .refine((r) => r.status !== "answered" || (r.raw !== undefined && r.answeredAt !== undefined), {
    path: ["raw"],
    message: "An answered response needs raw data and answeredAt",
  });

export const conceptMapNodeSchema = z.object({
  key: z.string().min(1).max(64),
  conceptId: uuidSchema.nullable(),
  label: nonBlank(200),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const conceptMapEdgeSchema = z
  .object({
    key: z.string().min(1).max(64),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
    relationshipType: relationshipTypeCodeSchema.nullish(),
    label: z.string().max(200).nullish(),
    directed: z.boolean().default(true),
  })
  .refine((e) => e.source !== e.target, { message: "A link needs two different nodes" });

/** Participant concept map as produced by the editor (concept_maps + concept_map_edges). */
export const conceptMapSubmissionSchema = z
  .object({
    sessionId: uuidSchema,
    itemId: uuidSchema,
    phase: z.enum(CONCEPT_MAP_PHASES),
    revision: z.number().int().positive(),
    isFinal: z.boolean(),
    nodes: z.array(conceptMapNodeSchema).max(200),
    edges: z.array(conceptMapEdgeSchema).max(1000),
    raw: jsonObjectSchema.default({}),
  })
  .superRefine((m, ctx) => {
    const nodeKeys = new Set<string>();
    m.nodes.forEach((n, i) => {
      if (nodeKeys.has(n.key)) ctx.addIssue({ code: "custom", path: ["nodes", i, "key"], message: "Duplicate node key" });
      nodeKeys.add(n.key);
    });
    const edgeKeys = new Set<string>();
    m.edges.forEach((e, i) => {
      if (edgeKeys.has(e.key)) ctx.addIssue({ code: "custom", path: ["edges", i, "key"], message: "Duplicate edge key" });
      edgeKeys.add(e.key);
      if (!nodeKeys.has(e.source) || !nodeKeys.has(e.target)) {
        ctx.addIssue({ code: "custom", path: ["edges", i], message: "Edge endpoints must be nodes of this map" });
      }
    });
  });
export type ConceptMapSubmission = z.infer<typeof conceptMapSubmissionSchema>;

export const referenceMapEdgeInputSchema = z
  .object({
    sourceConceptId: uuidSchema,
    targetConceptId: uuidSchema,
    relationshipTypeCode: relationshipTypeCodeSchema.nullish(),
    directed: z.boolean().default(true),
    weight: z.number().positive().default(1),
    required: z.boolean().default(false),
    notes: z.string().max(2000).nullish(),
  })
  .refine((e) => e.sourceConceptId !== e.targetConceptId, { message: "Self-links are not allowed" });

export const referenceMapRaterSubmissionSchema = z.object({
  referenceMapId: uuidSchema,
  role: z.enum(RATER_ROLES).default("rater"),
  submission: z.object({ edges: z.array(referenceMapEdgeInputSchema) }),
  notes: z.string().max(4000).nullish(),
});

export const derivedScoreSchema = z.object({
  sessionId: uuidSchema,
  assessmentId: uuidSchema,
  conceptMapId: uuidSchema.nullish(),
  responseId: uuidSchema.nullish(),
  referenceMapId: uuidSchema.nullish(),
  rubricId: uuidSchema.nullish(),
  metricName: z.string().regex(/^[a-z][a-z0-9_.]{0,63}$/),
  metricVersion: z.string().min(1).max(32),
  value: z.number().nullable(),
  details: jsonObjectSchema.default({}),
  pipelineVersion: z.string().min(1).max(64),
});
export type DerivedScore = z.infer<typeof derivedScoreSchema>;
