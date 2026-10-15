/**
 * Study-engine contracts: protocol-as-data study configuration, conditions, pseudonymous
 * participants, consent, allocation records, sessions and deviations.
 *
 * Privacy: nothing here accepts names, emails or other direct identifiers. Participant codes
 * are pattern-checked (as in the database) and an email-looking code is rejected explicitly.
 * Design choices that are still open (Q-R3 design/randomisation, Q-R5 guidance, Q-R9
 * exposure, Q-R10 WebGL failure policy) are explicit config fields, not code constants.
 */
import { z } from "zod";

import {
  ALLOCATION_ALGORITHMS,
  CONDITION_INTERFACES,
  CONSENT_DECISIONS,
  DEVIATION_SEVERITIES,
  PARTICIPANT_STATUSES,
  SESSION_STATUSES,
  STUDY_DESIGNS,
  STUDY_PHASES,
  STUDY_STATUSES,
} from "@/lib/validation/enums";
import { LEARNING_CONDITIONS } from "@/lib/permissions/learning";
import { demoConsistencyIssue, nonBlank, sha256Schema, slugSchema, uuidSchema } from "@/lib/validation/primitives";

export const studyDesignSchema = z.enum(STUDY_DESIGNS);
export const studyStatusSchema = z.enum(STUDY_STATUSES);
export const conditionInterfaceSchema = z.enum(CONDITION_INTERFACES);
export const allocationAlgorithmSchema = z.enum(ALLOCATION_ALGORITHMS);
export const studyPhaseSchema = z.enum(STUDY_PHASES);

/** Pseudonymous participant code (db: participants_code_ck). */
export const participantCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/, "3–32 letters, digits, '-' or '_'")
  .refine((c) => !c.includes("@"), "Never use an email address as a participant code");

export const conditionCodeSchema = z.string().regex(/^[a-z][a-z0-9_]{0,47}$/);

/** Content set / task code recorded per allocation period (db: allocations_content_set_ck). */
export const periodCodeSchema = z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/, "lowercase letters, digits, '.', '_' or '-'");

export const ALLOCATION_POINTS = ["enrolment", "after_pre_test"] as const;
export const STRATUM_SOURCES = ["pre_map_recall", "pre_test_score"] as const;

/**
 * Journey steps after consent (study engine). Device check and allocation are not configurable
 * steps: allocation follows the last condition-blind step (or consent), the device check follows
 * allocation, and completion follows the last step.
 */
export const STUDY_STEPS = [
  "questionnaire_pre",
  "pre_test",
  "pre_reconstruction",
  "familiarisation",
  "onboarding",
  "learning",
  "questionnaire_post_learning",
  "post_test",
  "transfer",
  "reconstruction",
  "questionnaire_end",
] as const;
export type StudyStep = (typeof STUDY_STEPS)[number];

/** An instrument of a questionnaire step: an assessment code, optionally pinned and limited to conditions. */
export const instrumentRefSchema = z.union([
  z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
  z.object({
    code: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
    version: z.number().int().positive().optional(),
    conditions: z.array(z.enum(LEARNING_CONDITIONS)).min(1).optional(),
  }),
]);
export type InstrumentRef = z.infer<typeof instrumentRefSchema>;

/** Protocol configuration stored in studies.config (frozen once the study is active). */
export const studyConfigSchema = z.object({
  /** Tradition slugs included in the study (default three; not a constant, see digest §2). */
  traditionSlugs: z.array(slugSchema).min(1).default([]),
  /**
   * Matched content sets for within-subjects / counterbalanced designs (digest §6: a
   * participant may receive more than one tradition set). Each allocation period records
   * which set it used (allocations.content_set_code); the database rejects codes not declared
   * here.
   */
  contentSets: z.record(periodCodeSchema, z.object({ traditionSlugs: z.array(slugSchema).min(1), label: z.string().max(120).optional() })).optional(),
  allocation: z
    .object({
      algorithm: allocationAlgorithmSchema.default("block"),
      blockSize: z.number().int().positive().optional(),
      /** Researcher-entered strata, used only when `point = "enrolment"`. */
      strata: z.array(z.string().min(1)).default([]),
      /** Randomisation seed, recorded on every allocation (study engine). Keep it secret for concealment. */
      seed: z.string().min(1).max(128).optional(),
      /**
       * When the participant is allocated (study decision D3): after the condition-blind
       * pre-allocation steps (questionnaire_pre, pre_test, pre_reconstruction), or at consent.
       */
      point: z.enum(ALLOCATION_POINTS).default("after_pre_test"),
      /**
       * Stratum from the pre-test (D3): "low" (score ≤ cutoff) or "high". `pre_map_recall` is
       * `cmap.recall.dl` of the final pre map against the study's locked reference map;
       * `pre_test_score` the auto-scored pre-test total. Needs `algorithm = stratified_block`
       * and `point = after_pre_test`.
       */
      stratifyBy: z.object({ source: z.enum(STRATUM_SOURCES), cutoff: z.number().finite() }).optional(),
    })
    .default({ algorithm: "block", strata: [], point: "after_pre_test" }),
  /**
   * Learning-phase exposure (Q-R9). `fixed_time`: every session of BOTH conditions gets the same
   * `minutes`; the server stamps the learning clock (study_sessions.learning_*, migration 0009)
   * and the learning context exposes it as `learningTime`.
   */
  exposure: z
    .object({
      mode: z.enum(["fixed_time", "self_paced"]).default("self_paced"),
      minutes: z.number().int().positive().optional(),
      /** fixed_time only: may a participant end the learning phase before the budget runs out? Same for both conditions. */
      allowEarlyFinish: z.boolean().default(false),
    })
    .refine((e) => e.mode !== "fixed_time" || e.minutes !== undefined, { path: ["minutes"], message: "A fixed_time study needs exposure.minutes" })
    .default({ mode: "self_paced", allowEarlyFinish: false }),
  /**
   * Guidance, identical in both conditions and not manipulated (Q-R5, study decision D6). With
   * `policy = "hybrid"` and `cueEnabled`, both conditions show the same on-demand hint
   * (`hintText`, written by the researchers) and the same stall cue after `stallSeconds` of
   * active time without a newly exposed concept (a pilot parameter, provisionally 120 s in D6).
   * Read through the learning context (`settings.guidance`), never per page.
   */
  guidance: z
    .object({
      policy: z.enum(["exploration_first", "guided", "hybrid", "none"]).default("none"),
      cueEnabled: z.boolean().default(false),
      stallSeconds: z.number().int().min(10).max(1800).default(120),
      hintText: z.string().trim().min(1).max(2000).optional(),
    })
    .default({ policy: "none", cueEnabled: false, stallSeconds: 120 }),
  /** What happens when WebGL fails for an immersive participant (Q-R10). */
  webglFailurePolicy: z.enum(["exclude", "retry", "reassign"]).default("retry"),
  minimap: z.enum(["on", "off", "toggle"]).default("toggle"),
  /**
   * Concept search in the learning conditions (Q-R6: which query affordance exists is still
   * open). Off unless the protocol enables it; when on it must be on for both conditions.
   * Read through the learning context (`features.search`), never per page.
   */
  searchEnabled: z.boolean().default(false),
  /**
   * Knowledge figures (DR-018). `structureDiagrams` (default on) shows the graph-derived structure
   * diagrams (process sequence, materials and tools, colour mechanism); off removes them from BOTH
   * conditions together, so researchers can rule out the 2D condition gaining structural
   * visualisation. Read through the learning context (`settings.figures`), never per page.
   */
  figures: z.object({ structureDiagrams: z.boolean().default(true) }).default({ structureDiagrams: true }),
  /**
   * Learning-task prompts written by the researchers, shown verbatim and identically in both
   * conditions (shared LearningTaskPrompts). Read through the learning context.
   */
  learningPrompts: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/), text: z.string().trim().min(1).max(1000) }))
    .max(20)
    .refine((ps) => new Set(ps.map((p) => p.id)).size === ps.length, "Prompt ids must be unique")
    .default([]),
  /**
   * Marks a study whose sessions are never experimental data (demo / pilot walkthroughs).
   * Demo studies (is_demo) are always non-experimental regardless of this flag.
   */
  nonExperimental: z.boolean().default(false),
  /** Inclusion / exclusion criteria (free text, one criterion per line; never participant data). */
  eligibility: z
    .object({
      inclusion: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
      exclusion: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
    })
    .default({ inclusion: [], exclusion: [] }),
  consentVersion: z.string().min(1).max(64).optional(),
  // ---- participant journey (study engine, src/server/study/config.ts validates the order) ----
  /** Versioned consent text, shown verbatim; its sha256 is stored with the decision. */
  consent: z.object({ version: z.string().min(1).max(64), text: z.string().min(1).max(20_000) }).optional(),
  /** Participant information sheet shown before consent. */
  participantInformation: z.string().max(20_000).optional(),
  /** Ordered journey steps (default: study decision D8 order). */
  steps: z.array(z.enum(STUDY_STEPS)).min(1).optional(),
  /** Instruments of each questionnaire step, by assessment code (must be in the study battery). */
  questionnaires: z
    .object({ pre: z.array(instrumentRefSchema).default([]), postLearning: z.array(instrumentRefSchema).default([]), end: z.array(instrumentRefSchema).default([]) })
    .optional(),
  /** Content-free practice of the assigned pathway's controls (D5); not learning time. */
  familiarisation: z.object({ minutes: z.number().int().min(5).max(10) }).optional(),
  resume: z
    .object({
      allowed: z.boolean().default(true),
      maxInterruptions: z.number().int().min(0).optional(),
      maxGapMinutes: z.number().int().positive().optional(),
    })
    .default({ allowed: true }),
  device: z.object({ minViewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional() }).default({}),
  /** Repeat enrolment from one browser: refused (true) or flagged in the journal (false; shared lab machines). */
  enrolment: z.object({ blockRepeatBrowser: z.boolean().default(false) }).default({ blockRepeatBrowser: false }),
  retentionDays: z.number().int().positive().optional(),
  notes: z.string().max(4000).optional(),
});
export type StudyConfig = z.infer<typeof studyConfigSchema>;

export const studyConditionInputSchema = z.object({
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
    if (s.design === "within" && Object.keys(s.config.contentSets ?? {}).length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["config", "contentSets"],
        message: "A within-subjects study needs at least two matched content sets",
      });
    }
  });
export type StudyInput = z.infer<typeof studyInputSchema>;

export const participantEnrolSchema = z.object({
  studyId: uuidSchema,
  code: participantCodeSchema,
  stratum: z.string().max(64).nullish(),
});

export const participantStatusSchema = z.enum(PARTICIPANT_STATUSES);

export const consentRecordInputSchema = z.object({
  participantId: uuidSchema,
  consentVersion: z.string().min(1).max(64),
  consentTextSha256: sha256Schema,
  decision: z.enum(CONSENT_DECISIONS),
  method: z.enum(["on_screen", "paper", "verbal_witnessed"]).default("on_screen"),
});

/** A reproducible allocation decision (allocations; append-only). */
export const allocationRecordSchema = z
  .object({
    studyId: uuidSchema,
    participantId: uuidSchema,
    conditionId: uuidSchema,
    period: z.number().int().positive().default(1),
    algorithm: allocationAlgorithmSchema,
    seed: z.string().min(1).max(128),
    sequenceIndex: z.number().int().min(0),
    blockIndex: z.number().int().min(0).nullish(),
    stratum: z.string().max(64).nullish(),
    studyProtocolVersion: z.string().min(1).max(64),
    overrideReason: z.string().max(2000).nullish(),
    /** Content set received in this period (required for within-subjects designs, by trigger). */
    contentSetCode: periodCodeSchema.nullish(),
    /** Learning task received in this period, if the protocol defines tasks. */
    taskCode: periodCodeSchema.nullish(),
  })
  .refine((a) => a.algorithm !== "manual" || !!a.overrideReason, {
    path: ["overrideReason"],
    message: "Manual allocation needs a reason",
  });

/** Device covariates (study_sessions.device). No fingerprinting: coarse classes only. */
export const sessionDeviceSchema = z.object({
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  devicePixelRatio: z.number().positive().max(8).optional(),
  inputDevices: z.array(z.enum(["mouse", "keyboard", "touch", "gamepad", "xr"])).default([]),
  gpuTier: z.enum(["low", "mid", "high", "unknown"]).default("unknown"),
  qualityTier: z.enum(["low", "medium", "high"]).optional(),
  webglVersion: z.union([z.literal(1), z.literal(2)]).nullish(),
  reducedMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  /** High contrast accommodation chosen in the study's Display Settings before learning (DR-019). */
  contrastAccommodation: z.boolean().optional(),
  browserFamily: z.string().max(40).optional(),
});
export type SessionDevice = z.infer<typeof sessionDeviceSchema>;

export const sessionStatusSchema = z.enum(SESSION_STATUSES);

export const sessionExclusionSchema = z.object({
  sessionId: uuidSchema,
  reason: nonBlank(2000),
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
