import { z } from "zod";

import {
  ASSESSMENT_ITEM_KINDS,
  ASSESSMENT_KINDS,
  CONCEPT_MAP_PHASES,
} from "@/lib/validation/enums";
import { demoConsistencyIssue, jsonObjectSchema, nonBlank, relationshipTypeCodeSchema, uuidSchema } from "@/lib/validation/primitives";

export const assessmentKindSchema = z.enum(ASSESSMENT_KINDS);
const assessmentItemKindSchema = z.enum(ASSESSMENT_ITEM_KINDS);

export const assessmentCodeSchema = z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/);
const itemKeySchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/);

const optionSchema = z.object({ id: z.string().min(1).max(64), label: nonBlank(500) });
export type TestItemType = "pre_test" | "identification" | "stage_placement" | "sequence" | "cloth_state" | "attribution" | "transfer";

const itemImageSchema = z.object({ path: z.string().regex(/^\/[A-Za-z0-9/_.-]+\.(jpg|jpeg|png|webp)$/), alt: nonBlank(300) });

const itemTargetSchema = z.object({ tradition: z.string().min(1).max(64), stageKey: z.string().min(1).max(120).optional(), objectKey: z.string().min(1).max(120).optional() });

const testItemFields = {
  image: itemImageSchema.optional(),
  account: z.string().min(1).max(4000).optional(),
  sampleText: z.boolean().default(false),
  target: itemTargetSchema.optional(),
};

export const itemConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("single_choice"), options: z.array(optionSchema).min(2), shuffle: z.boolean().default(false), ...testItemFields }),
  z.object({ kind: z.literal("multiple_choice"), options: z.array(optionSchema).min(2), shuffle: z.boolean().default(false), maxSelections: z.number().int().positive().optional() }),
  z.object({ kind: z.literal("short_text"), maxLength: z.number().int().positive().max(2000).default(500) }),
  z.object({ kind: z.literal("long_text"), maxLength: z.number().int().positive().max(20000).default(5000) }),
  z.object({
    kind: z.literal("likert"),
    points: z.number().int().min(2).max(11),
    min: z.number().int().min(0).max(1).default(1),
    anchors: z.record(z.string(), z.string()).default({}),
  }),
  z.object({ kind: z.literal("numeric"), min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional() }),
  z.object({ kind: z.literal("ranking"), options: z.array(optionSchema).min(2), ...testItemFields }),
  z.object({
    kind: z.literal("matching"),
    pairs: z.array(z.object({ id: z.string().min(1).max(64), image: itemImageSchema })).min(2),
    options: z.array(optionSchema).min(2),
    shuffle: z.boolean().default(false),
    ...testItemFields,
  }),
  z.object({ kind: z.literal("sketch"), maxStrokes: z.number().int().positive().max(2000).default(600), maxBytes: z.number().int().positive().max(400_000).default(200_000) }),
  z.object({
    kind: z.literal("concept_map"),
    conceptKeys: z.array(z.string().min(1)).min(2),
    allowFreeNodes: z.boolean().default(false),
    relationshipTypes: z.array(relationshipTypeCodeSchema).default([]),
    directed: z.boolean().default(true),
    target: itemTargetSchema.optional(),
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

const conceptMapNodeSchema = z.object({
  key: z.string().min(1).max(64),
  conceptId: uuidSchema.nullable(),
  label: nonBlank(200),
  x: z.number().finite(),
  y: z.number().finite(),
});

const conceptMapEdgeSchema = z
  .object({
    key: z.string().min(1).max(64),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
    relationshipType: relationshipTypeCodeSchema.nullish(),
    label: z.string().max(200).nullish(),
    directed: z.boolean().default(true),
  })
  .refine((e) => e.source !== e.target, { message: "A link needs two different nodes" });

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
