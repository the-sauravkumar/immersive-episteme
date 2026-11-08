import { z } from "zod";

import {
  ALLOCATION_ALGORITHMS,
  CONDITION_INTERFACES,
  DEVIATION_SEVERITIES,
} from "@/lib/validation/enums";
import { LEARNING_CONDITIONS } from "@/lib/permissions/learning";
import { demoConsistencyIssue, nonBlank, slugSchema, uuidSchema } from "@/lib/validation/primitives";

const studyDesignSchema = z.literal("between");
const conditionInterfaceSchema = z.enum(CONDITION_INTERFACES);
const allocationAlgorithmSchema = z.enum(ALLOCATION_ALGORITHMS);

export const participantCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, "3–32 letters, digits, '-' or '_'")
  .refine((c) => !c.includes("@"), "Never use an email address as a participant code");

const conditionCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);

const STRATUM_SOURCES = ["pre_test_score"] as const;

export const STUDY_STEPS = [
  "questionnaire_pre",
  "pre_test",
  "entrance",
  "familiarisation",
  "onboarding",
  "learning",
  "questionnaire_post_learning",
  "post_test",
  "transfer",
  "reconstruction",
  "layout_sketch",
  "questionnaire_end",
  "delayed_test",
] as const;
export type StudyStep = (typeof STUDY_STEPS)[number];

const instrumentRefSchema = z.union([
  z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  z.object({
    code: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
    version: z.number().int().positive().optional(),
    conditions: z.array(z.enum(LEARNING_CONDITIONS)).min(1).optional(),
  }),
]);
export type InstrumentRef = z.infer<typeof instrumentRefSchema>;

export const studyConfigSchema = z.object({
  traditionSlugs: z.array(slugSchema).min(1).default([]),
  allocation: z
    .object({
      algorithm: allocationAlgorithmSchema.default("block"),
      blockSize: z.number().int().positive().optional(),
      seed: z.string().min(1).max(128).optional(),
      stratifyBy: z.object({ source: z.enum(STRATUM_SOURCES), cutoff: z.number().finite() }).optional(),
    })
    .default({ algorithm: "block" }),
  exposure: z.object({ minutes: z.number().int().positive().optional() }).default({}),
  delayedTest: z
    .object({
      opensAfterDays: z.number().int().min(1).max(60).default(6),
      dueAfterDays: z.number().int().min(1).max(60).default(7),
      closesAfterDays: z.number().int().min(1).max(90).default(14),
    })
    .refine((d) => d.opensAfterDays <= d.dueAfterDays && d.dueAfterDays <= d.closesAfterDays, { message: "The delayed test window must open, fall due and close in that order" })
    .default({ opensAfterDays: 6, dueAfterDays: 7, closesAfterDays: 14 }),
  guidance: z
    .object({
      cueEnabled: z.boolean().default(false),
      stallSeconds: z.number().int().min(10).max(1800).default(120),
      hintText: z.string().trim().min(1).max(2000).optional(),
    })
    .default({ cueEnabled: false, stallSeconds: 120 }),
  webglFailurePolicy: z.enum(["exclude", "retry", "reassign"]).default("retry"),
  figures: z
    .object({ structureDiagrams: z.boolean().default(true), photos: z.boolean().default(true) })
    .default({ structureDiagrams: true, photos: true }),
  learningPrompts: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), text: z.string().trim().min(1).max(1000) }))
    .max(20)
    .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, "Prompt ids must be unique")
    .default([]),
  nonExperimental: z.boolean().default(false),
  consent: z.object({ version: z.string().min(1).max(64), text: z.string().min(1).max(20_000) }).optional(),
  participantInformation: z.string().max(20_000).optional(),
  steps: z.array(z.enum(STUDY_STEPS)).min(1).optional(),
  questionnaires: z
    .object({ pre: z.array(instrumentRefSchema).default([]), postLearning: z.array(instrumentRefSchema).default([]), end: z.array(instrumentRefSchema).default([]) })
    .optional(),
  resume: z
    .object({
      allowed: z.boolean().default(true),
      maxInterruptions: z.number().int().min(0).optional(),
      maxGapMinutes: z.number().int().positive().optional(),
    })
    .default({ allowed: true }),
  device: z.object({ minViewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional() }).default({}),
  enrolment: z
    .object({
      blockRepeatBrowser: z.boolean().default(false),
      maxPerAddressPer10Minutes: z.number().int().positive().max(10_000).optional(),
      maxPerHour: z.number().int().positive().max(100_000).optional(),
      maxParticipants: z.number().int().positive().optional(),
    })
    .default({ blockRepeatBrowser: false }),
  retentionDays: z.number().int().positive().optional(),
  notes: z.string().max(4000).optional(),
});
export type StudyConfig = z.infer<typeof studyConfigSchema>;

const studyConditionInputSchema = z.object({
  code: conditionCodeSchema,
  label: nonBlank(120),
  interface: conditionInterfaceSchema,
  allocationWeight: z.number().int().positive().default(1),
  position: z.number().int().min(0).default(0),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const studyInputSchema = z
  .object({
    slug: slugSchema,
    title: nonBlank(300),
    description: z.string().max(4000).nullish(),
    protocolVersion: z.string().min(1).max(64),
    design: studyDesignSchema,
    snapshotId: uuidSchema.nullish(),
    manifestId: uuidSchema.nullish(),
    config: studyConfigSchema,
    allowUnverifiedContent: z.boolean().default(false),
    conditions: z.array(studyConditionInputSchema).min(2, "A study compares at least two conditions"),
    isDemo: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    const issue = demoConsistencyIssue({ isDemo: s.isDemo, slugOrKey: s.slug, title: s.title });
    if (issue) ctx.addIssue({ code: "custom", path: ["isDemo"], message: issue });
    const codes = new Set<string>();
    s.conditions.forEach((c, i) => {
      if (codes.has(c.code)) ctx.addIssue({ code: "custom", path: ["conditions", i, "code"], message: "Duplicate condition code" });
      codes.add(c.code);
    });
    const interfaces = new Set(s.conditions.map((c) => c.interface));
    if (interfaces.size < 2) {
      ctx.addIssue({ code: "custom", path: ["conditions"], message: "Include both the 2D and the 3D condition" });
    }
  });

export const protocolDeviationInputSchema = z.object({
  studyId: uuidSchema,
  sessionId: uuidSchema.nullish(),
  participantId: uuidSchema.nullish(),
  category: z.enum(["procedure", "technical", "consent", "timing", "allocation", "content", "other"]),
  severity: z.enum(DEVIATION_SEVERITIES),
  description: nonBlank(4000),
  resolution: z.string().max(4000).nullish(),
});

export const sessionAnnotationInputSchema = z.object({
  sessionId: uuidSchema,
  kind: z.enum(["note", "observation", "technical_issue", "data_quality"]).default("note"),
  body: nonBlank(4000),
});
