/**
 * CMS authoring inputs (Zod). Stricter than the generic authoring contracts in
 * src/features/knowledge/contracts.ts because they implement the citation policy
 * (docs/research/citation-policy.md, "What every citation must contain"): every claim cites at
 * least one source, every citation carries a page or locator, and every claim carries the verbatim
 * evidence quotation. Learner-facing summary/body are never accepted from a form: they are
 * generated from the claims (content/FORMAT.md, "Learner-facing text is built from claims only").
 *
 * Pure (zod only); also usable from client components for hints.
 */
import { z } from "zod";

import {
  CONCEPT_TYPES,
  KNOWLEDGE_CATEGORY_CODES,
  PROVENANCE_KINDS,
  SOURCE_RELIABILITIES,
  VERIFICATION_STATES,
} from "@/lib/validation/enums";
import { MAX_QUOTE_WORDS, SLUG_REGEX, RELATIONSHIP_TYPE_CODE_REGEX, wordCount } from "@/lib/validation/primitives";

const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number, msg = "Required") => z.string().trim().min(1, msg).max(max);
/** "" / null / undefined -> null. */
const optionalText = (max: number) =>
  z
    .union([z.string(), z.null()]).optional()
    .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null))
    .pipe(z.string().max(max).nullable());
const optionalInt = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null()]).optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());
const optionalNumber = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.null()]).optional()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v)))
    .pipe(z.number().min(min).max(max).nullable());
const optionalUrl = z
  .union([z.string(), z.null()]).optional()
  .transform((v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null))
  .pipe(z.url({ protocol: /^https?$/, error: "Use an http(s) URL" }).nullable());
const list = z
  .union([z.string(), z.array(z.string()), z.null()]).optional()
  .transform((v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((s) => s.trim()).filter(Boolean));
const uuid = z.uuid("Choose an item from the list");
const checkbox = z.union([z.literal("on"), z.literal("true"), z.boolean(), z.null()]).optional().transform((v) => v === true || v === "on" || v === "true");

/** Verbatim quotation: required, ≤ 25 words (db: concept_claims_quote_ck). */
export const evidenceQuoteSchema = z
  .string()
  .trim()
  .min(1, "Paste the verbatim quotation from the source that supports this claim")
  .refine((q) => wordCount(q) <= MAX_QUOTE_WORDS, `Quotations are limited to ${MAX_QUOTE_WORDS} words; quote only what supports the claim`);

/** Page or locator: "p. 4362 (PDF p. 4)", "§ \"Process\", para 3". */
export const locatorSchema = z
  .string()
  .trim()
  .min(1, 'Give the page (e.g. "p. 12 (PDF p. 4)") or, for unpaginated sources, a locator (e.g. "§ Process, para 3")')
  .max(200);

/**
 * One citation of a claim. `quote` is the verbatim passage from THIS source (optional here; the
 * review gate requires one per citation when a claim cites more than one source, because the
 * claim's own quote can only be shown for a single-source claim; final review knowledge-06).
 */
export const claimCitationSchema = z.object({
  sourceId: uuid,
  locator: locatorSchema,
  quote: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : undefined))
    .pipe(evidenceQuoteSchema.optional()),
});

export const cmsClaimSchema = z.object({
  text: required(4000, "Write the claim").refine((t) => !/\n\s*\n/.test(t), "One claim is one statement (no paragraphs)"),
  quote: evidenceQuoteSchema,
  sources: z
    .array(claimCitationSchema)
    .min(1, "Every claim cites at least one source")
    .refine((s) => new Set(s.map((x) => x.sourceId)).size === s.length, "Cite each source once per claim"),
});
export type CmsClaim = z.infer<typeof cmsClaimSchema>;

/** Claims are submitted as one JSON field (`claims`), replacing the concept's claim list. */
export const saveClaimsSchema = z.object({
  conceptId: uuid,
  claims: z
    .string()
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Malformed claim list" });
        return z.NEVER;
      }
    })
    .pipe(z.array(cmsClaimSchema).min(1, "A concept needs at least one claim").max(60)),
});

export const KEY_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const conceptCreateSchema = z.object({
  packageSlug: z.string().regex(SLUG_REGEX, "Choose a tradition or package"),
  type: z.enum(CONCEPT_TYPES),
  name: z.string().trim().regex(KEY_NAME_REGEX, "Lowercase words joined by hyphens, e.g. indigo-vat").max(80),
  categoryCode: z.enum(KNOWLEDGE_CATEGORY_CODES),
  title: required(300),
  provenanceKind: z.enum(PROVENANCE_KINDS),
  localTerms: list,
});

export const conceptUpdateSchema = z.object({
  conceptId: uuid,
  categoryCode: z.enum(KNOWLEDGE_CATEGORY_CODES),
  title: required(300),
  provenanceKind: z.enum(PROVENANCE_KINDS),
  localTerms: list,
  compares: list,
});

export const notesSchema = z.object({
  conceptId: uuid,
  /** Tiptap JSON document as text; sanitised by src/server/cms/rich-text.ts before storing. */
  doc: z
    .string()
    .max(200_000)
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Malformed notes document" });
        return z.NEVER;
      }
    }),
});

export const sourceSchema = z.object({
  sourceId: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  kind: z.enum(PROVENANCE_KINDS),
  title: required(1000),
  author: optionalText(500),
  publisher: optionalText(500),
  year: optionalInt(0, 2100),
  url: optionalUrl,
  accessedOn: z
    .union([z.iso.date(), z.literal(""), z.null()]).optional()
    .transform((v) => (v ? v : null)),
  reliability: z.union([z.enum(SOURCE_RELIABILITIES), z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  citation: optionalText(2000),
  notes: optionalText(4000),
});

export const traditionSchema = z.object({
  traditionId: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
  slug: z.string().trim().regex(SLUG_REGEX, "Lowercase words joined by hyphens").max(120),
  name: required(300),
  altNames: list,
  regionPlace: optionalText(200),
  regionDistrict: optionalText(200),
  regionState: optionalText(200),
  regionCountry: optionalText(200),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
  giRegistered: z.enum(["", "yes", "no"]).transform((v) => (v === "" ? null : v === "yes")),
  giApplicationNo: optionalText(100),
  giYear: optionalInt(1999, 2100),
});

export const traditionSourceSchema = z.object({
  traditionId: uuid,
  sourceId: uuid,
  purpose: z.enum(["gi", "summary", "region", "general"]),
  remove: checkbox,
});

export const relationshipCitationSchema = z.object({
  sourceId: uuid,
  locator: locatorSchema,
  quote: evidenceQuoteSchema,
});

export const relationshipSchema = z
  .object({
    relationshipId: z.union([uuid, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null)),
    sourceConceptId: uuid,
    targetConceptId: uuid,
    typeCode: z.string().regex(RELATIONSHIP_TYPE_CODE_REGEX, "Choose a relationship type"),
    explanation: optionalText(4000),
    conditions: optionalText(4000),
    ordinal: optionalInt(1, 10_000),
    strength: optionalNumber(0, 1),
    provenanceKind: z.enum(PROVENANCE_KINDS),
    sources: z
      .union([z.string(), z.array(relationshipCitationSchema)])
      .transform((s, ctx) => {
        if (Array.isArray(s)) return s;
        if (s.trim() === "") return [];
        try {
          return JSON.parse(s) as unknown;
        } catch {
          ctx.addIssue({ code: "custom", message: "Malformed source list" });
          return z.NEVER;
        }
      })
      .pipe(z.array(relationshipCitationSchema).max(20)),
  })
  .refine((r) => r.sourceConceptId !== r.targetConceptId, { path: ["targetConceptId"], message: "A concept cannot relate to itself" });

export const deleteRelationshipSchema = z.object({ relationshipId: uuid });

export const ENTITY_KINDS = ["tradition", "concept", "relationship", "source"] as const;
export type CmsEntityKind = (typeof ENTITY_KINDS)[number];

/** What a verifier confirms before verifying (recorded with the decision). */
export const EVIDENCE_CHECKS = {
  sources_consulted: "I consulted every cited source (archived copy or the original)",
  quotes_verbatim: "Each quotation appears verbatim at the stated page or locator",
  claims_supported: "Each claim / relationship is supported by its quotation, without overstatement",
  provenance_kind: "The provenance kind (practitioner testimony, scientific evidence, …) is correct",
} as const;
export type EvidenceCheck = keyof typeof EVIDENCE_CHECKS;
export const EVIDENCE_CHECK_KEYS = Object.keys(EVIDENCE_CHECKS) as EvidenceCheck[];

export const transitionSchema = z.object({
  entityKind: z.enum(ENTITY_KINDS),
  entityId: uuid,
  to: z.enum(VERIFICATION_STATES),
  reason: optionalText(2000),
  evidenceChecked: z
    .union([z.string(), z.array(z.string()), z.null()]).optional()
    .transform((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .pipe(z.array(z.enum(EVIDENCE_CHECK_KEYS as [EvidenceCheck, ...EvidenceCheck[]]))),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const RELEASE_LABEL_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const releaseSchema = z
  .object({
    versionLabel: z
      .string()
      .trim()
      .regex(RELEASE_LABEL_REGEX, "Letters, digits, '.', '_' or '-' (max 64), e.g. release-1")
      .refine((l) => !/^(demo|review)/i.test(l), "Labels starting with 'demo' or 'review' are reserved"),
    title: required(300),
    description: optionalText(4000),
    confirmVersionLabel: z.string().trim(),
  })
  .refine((r) => r.versionLabel === r.confirmVersionLabel, {
    path: ["confirmVersionLabel"],
    message: "Type the version label again to confirm: publishing is irreversible",
  });

export const trimmedText = trimmed;
