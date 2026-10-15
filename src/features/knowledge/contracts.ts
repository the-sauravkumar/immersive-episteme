/**
 * Knowledge-domain contracts (Zod). Three groups:
 *
 *  1. Interchange format v1 — the JSON files in content/ (content/FORMAT.md). The importer
 *     validates each file with `contentPackageFileSchema`, then resolves concept keys across
 *     files with `checkCrossFileReferences`. Imported content is stored as `under_review` /
 *     `needs_evidence`; it never arrives as verified.
 *  2. Authoring inputs — what the CMS submits to create or edit graph entities, plus the
 *     review-state machine (`VERIFICATION_TRANSITIONS`).
 *  3. Knowledge bundle v1 — the canonical JSON frozen into `content_snapshots.payload` and
 *     produced by the knowledge-graph export. Both learning conditions read only this.
 *
 * Documented in docs/architecture/knowledge-schema.md. Mirrors db/schema/knowledge.ts.
 */
import { z } from "zod";

import {
  CONCEPT_TYPES,
  KNOWLEDGE_CATEGORY_CODES,
  PROVENANCE_KINDS,
  RELATIONSHIP_SEMANTICS,
  SOURCE_RELIABILITIES,
  VERIFICATION_STATES,
  type VerificationState,
} from "@/lib/validation/enums";
import {
  conceptKeySchema,
  demoConsistencyIssue,
  httpUrlSchema,
  nonBlank,
  quoteSchema,
  relationshipTypeCodeSchema,
  sha256Schema,
  slugSchema,
  tiptapDocSchema,
  uuidSchema,
} from "@/lib/validation/primitives";

export const verificationStateSchema = z.enum(VERIFICATION_STATES);
export const provenanceKindSchema = z.enum(PROVENANCE_KINDS);
export const sourceReliabilitySchema = z.enum(SOURCE_RELIABILITIES);
export const conceptTypeSchema = z.enum(CONCEPT_TYPES);
export const knowledgeCategoryCodeSchema = z.enum(KNOWLEDGE_CATEGORY_CODES);
export const relationshipSemanticsSchema = z.enum(RELATIONSHIP_SEMANTICS);

// =========================================================================================
// Review state machine
// =========================================================================================

/**
 * Allowed review transitions. Enforced by the CMS service; the database additionally refuses
 * accepted states (verified/published) without an acting user, a sourced claim and a real
 * provenance kind (migration 0003).
 */
export const VERIFICATION_TRANSITIONS: Record<VerificationState, readonly VerificationState[]> = {
  draft: ["under_review", "archived"],
  under_review: ["verified", "needs_evidence", "rejected", "draft"],
  needs_evidence: ["under_review", "rejected", "archived"],
  verified: ["published", "under_review", "archived"],
  published: ["under_review", "archived"],
  rejected: ["draft", "archived"],
  archived: ["draft"],
};

export function canTransition(from: VerificationState, to: VerificationState): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}

export const verificationTransitionSchema = z
  .object({
    entityKind: z.enum(["tradition", "concept", "relationship", "source", "asset"]),
    entityId: uuidSchema,
    from: verificationStateSchema,
    to: verificationStateSchema,
    reason: z.string().trim().max(2000).optional(),
  })
  .superRefine((v, ctx) => {
    if (!canTransition(v.from, v.to)) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `Cannot move from ${v.from} to ${v.to}` });
    }
    if ((v.to === "rejected" || v.to === "needs_evidence") && !v.reason) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Give a reason for this decision" });
    }
  });
export type VerificationTransition = z.infer<typeof verificationTransitionSchema>;

// =========================================================================================
// 1. Interchange format v1 (content/FORMAT.md)
// =========================================================================================

/** States an imported file may carry (FORMAT.md: never "verified"). */
export const IMPORTABLE_STATES = ["under_review", "needs_evidence"] as const;
const importableStateSchema = z.enum(IMPORTABLE_STATES);

/**
 * File-local source id ("S1"). content/comparisons.json qualifies ids borrowed from a
 * tradition file with that file's slug ("ajrakh:S1"); the full source entry is repeated in
 * the comparisons file, so the id is still resolvable within the file. Stored verbatim in
 * sources.local_key (scoped by package); the importer may link it to the tradition's row.
 */
const localSourceIdSchema = z
  .string()
  .regex(/^([a-z0-9]+(-[a-z0-9]+)*:)?[A-Za-z][A-Za-z0-9_-]{0,31}$/, "Source ids look like S1 or <slug>:S1");

export const formatSourceSchema = z.object({
  id: localSourceIdSchema,
  kind: provenanceKindSchema,
  title: nonBlank(1000),
  author: z.string().nullish(),
  publisher: z.string().nullish(),
  year: z.number().int().min(0).max(2100).nullish(),
  url: httpUrlSchema.nullish(),
  accessed: z.iso.date().nullish(),
  reliability: sourceReliabilitySchema.nullish(),
  notes: z.string().nullish(),
});

/**
 * A located, verbatim passage from one of the claim's sources that supports it
 * (docs/research/citation-policy.md). `note` tells the curator what to check by hand.
 */
export const formatEvidenceSchema = z.object({
  source_id: localSourceIdSchema,
  locator: nonBlank(300),
  quote: nonBlank(1200),
  note: z.string().nullish(),
});

export const formatClaimSchema = z
  .object({
    text: nonBlank(4000),
    source_ids: z.array(localSourceIdSchema).min(1, "Every claim cites at least one source"),
    quote: quoteSchema.nullish(),
    evidence: z.array(formatEvidenceSchema).default([]),
  })
  .superRefine((cl, ctx) => {
    cl.evidence.forEach((e, i) => {
      if (!cl.source_ids.includes(e.source_id)) {
        ctx.addIssue({ code: "custom", path: ["evidence", i, "source_id"], message: `Evidence cites ${e.source_id}, which the claim does not cite` });
      }
    });
  });

export const formatConceptSchema = z
  .object({
    key: conceptKeySchema,
    type: conceptTypeSchema,
    category: knowledgeCategoryCodeSchema,
    title: nonBlank(300),
    summary: z.string().max(4000).default(""),
    body_md: z.string().nullish(),
    local_terms: z.array(z.string().min(1)).default([]),
    provenance_kind: provenanceKindSchema,
    verification_state: importableStateSchema,
    claims: z.array(formatClaimSchema).min(1, "Every concept carries at least one sourced claim"),
    /** comparison concepts only (content/comparisons.json). */
    compares: z.array(conceptKeySchema).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.key.split(".")[1] !== c.type) {
      ctx.addIssue({ code: "custom", path: ["key"], message: `Key type segment must be "${c.type}"` });
    }
    if (c.compares && c.compares.length > 0 && c.type !== "comparison") {
      ctx.addIssue({ code: "custom", path: ["compares"], message: "Only comparison concepts list `compares`" });
    }
  });

export const formatRelationshipSchema = z.object({
  source: conceptKeySchema,
  target: conceptKeySchema,
  type: relationshipTypeCodeSchema,
  explanation: z.string().nullish(),
  conditions: z.string().nullish(),
  ordinal: z.number().int().positive().nullish(),
  provenance_kind: provenanceKindSchema,
  verification_state: importableStateSchema,
  source_ids: z.array(localSourceIdSchema).default([]),
});

export const formatMediaCandidateSchema = z.object({
  url: httpUrlSchema,
  title: nonBlank(1000),
  licence: z.string().nullish(),
  author: z.string().nullish(),
  depicts: conceptKeySchema.nullish(),
  /** Source pixel size, so renderers keep the true aspect ratio (no stretching). */
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  mime: z.string().nullish(),
  /** Where width/height came from, e.g. "Wikimedia Commons API imageinfo (2026-10-14)". */
  dimensions_source: z.string().nullish(),
});

export const formatRegionSchema = z.object({
  place: z.string().nullish(),
  district: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lon: z.number().min(-180).max(180).nullish(),
});

export const formatGiSchema = z.object({
  registered: z.boolean(),
  application_no: z.string().nullish(),
  year: z.number().int().min(1999).max(2100).nullish(),
  source_ids: z.array(localSourceIdSchema).default([]),
});

/** One file: content/traditions/<slug>/tradition.json, content/shared/*.json, content/comparisons.json. */
export const contentPackageFileSchema = z
  .object({
    format_version: z.literal(1),
    slug: slugSchema,
    name: nonBlank(300),
    alt_names: z.array(z.string()).default([]),
    region: formatRegionSchema.nullish(),
    gi: formatGiSchema.nullish(),
    summary: z.string().nullish(),
    sources: z.array(formatSourceSchema),
    concepts: z.array(formatConceptSchema),
    relationships: z.array(formatRelationshipSchema).default([]),
    media_candidates: z.array(formatMediaCandidateSchema).default([]),
  })
  .superRefine((file, ctx) => {
    const sourceIds = new Set<string>();
    file.sources.forEach((s, i) => {
      if (sourceIds.has(s.id)) ctx.addIssue({ code: "custom", path: ["sources", i, "id"], message: `Duplicate source id ${s.id}` });
      sourceIds.add(s.id);
    });
    const unresolved = (ids: readonly string[], path: (string | number)[]) => {
      ids.forEach((id, j) => {
        if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", path: [...path, j], message: `Unknown source id ${id}` });
      });
    };
    if (file.gi) unresolved(file.gi.source_ids, ["gi", "source_ids"]);
    const keys = new Set<string>();
    file.concepts.forEach((c, i) => {
      if (keys.has(c.key)) ctx.addIssue({ code: "custom", path: ["concepts", i, "key"], message: `Duplicate concept key ${c.key}` });
      keys.add(c.key);
      c.claims.forEach((cl, k) => unresolved(cl.source_ids, ["concepts", i, "claims", k, "source_ids"]));
    });
    const edges = new Set<string>();
    file.relationships.forEach((r, i) => {
      unresolved(r.source_ids, ["relationships", i, "source_ids"]);
      if (r.source === r.target) ctx.addIssue({ code: "custom", path: ["relationships", i], message: "Self-loops are not allowed" });
      const edge = `${r.source}|${r.target}|${r.type}`;
      if (edges.has(edge)) ctx.addIssue({ code: "custom", path: ["relationships", i], message: `Duplicate edge ${edge}` });
      edges.add(edge);
    });
  });
export type ContentPackageFile = z.infer<typeof contentPackageFileSchema>;

/** Problems that need every file at once (concept keys referenced across files). */
export function checkCrossFileReferences(files: readonly ContentPackageFile[]): string[] {
  const problems: string[] = [];
  const owner = new Map<string, string>();
  for (const f of files) {
    for (const c of f.concepts) {
      const prev = owner.get(c.key);
      if (prev) problems.push(`Concept key ${c.key} is defined in both ${prev} and ${f.slug}`);
      owner.set(c.key, f.slug);
    }
  }
  for (const f of files) {
    for (const r of f.relationships) {
      for (const k of [r.source, r.target]) {
        if (!owner.has(k)) problems.push(`${f.slug}: relationship ${r.source} -${r.type}-> ${r.target} references unknown concept ${k}`);
      }
    }
    for (const c of f.concepts) {
      for (const k of c.compares ?? []) {
        if (!owner.has(k)) problems.push(`${f.slug}: ${c.key} compares unknown concept ${k}`);
      }
    }
  }
  return problems;
}

// =========================================================================================
// 2. Authoring inputs (CMS)
// =========================================================================================

const demoRefine =
  (slugField: "slug" | "key", titleField: "title" | "name") =>
  (v: Record<string, unknown> & { isDemo: boolean }, ctx: z.RefinementCtx) => {
    const issue = demoConsistencyIssue({
      isDemo: v.isDemo,
      slugOrKey: v[slugField] as string,
      title: v[titleField] as string,
    });
    if (issue) ctx.addIssue({ code: "custom", path: ["isDemo"], message: issue });
  };

export const traditionInputSchema = z
  .object({
    slug: slugSchema,
    name: nonBlank(300),
    altNames: z.array(z.string()).default([]),
    summary: z.string().max(4000).nullish(),
    regionPlace: z.string().nullish(),
    regionDistrict: z.string().nullish(),
    regionState: z.string().nullish(),
    regionCountry: z.string().nullish(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
    giRegistered: z.boolean().nullish(),
    giApplicationNo: z.string().nullish(),
    giYear: z.number().int().min(1999).max(2100).nullish(),
    isDemo: z.boolean().default(false),
  })
  .superRefine(demoRefine("slug", "name"));
export type TraditionInput = z.infer<typeof traditionInputSchema>;

export const sourceInputSchema = z
  .object({
    kind: provenanceKindSchema,
    title: nonBlank(1000),
    author: z.string().nullish(),
    publisher: z.string().nullish(),
    year: z.number().int().min(0).max(2100).nullish(),
    url: httpUrlSchema.nullish(),
    accessedOn: z.iso.date().nullish(),
    reliability: sourceReliabilitySchema.nullish(),
    citation: z.string().nullish(),
    notes: z.string().nullish(),
    isDemo: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.isDemo && !v.title.startsWith("Demo:")) {
      ctx.addIssue({ code: "custom", path: ["title"], message: "Demo sources need a 'Demo:' title" });
    }
    if (v.isDemo && v.kind !== "unverified") {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "Demo sources are always 'unverified'" });
    }
  });
export type SourceInput = z.infer<typeof sourceInputSchema>;

export const claimInputSchema = z.object({
  text: nonBlank(4000),
  quote: quoteSchema.nullish(),
  sources: z
    .array(z.object({ sourceId: uuidSchema, locator: z.string().max(200).nullish() }))
    .min(1, "Every claim cites at least one source"),
});

export const conceptInputSchema = z
  .object({
    key: conceptKeySchema,
    slug: slugSchema,
    type: conceptTypeSchema,
    categoryCode: knowledgeCategoryCodeSchema,
    traditionId: uuidSchema.nullish(),
    title: nonBlank(300),
    summary: z.string().max(4000).default(""),
    body: tiptapDocSchema.nullish(),
    bodyMd: z.string().nullish(),
    localTerms: z.array(z.string().min(1)).default([]),
    compares: z.array(conceptKeySchema).default([]),
    provenanceKind: provenanceKindSchema,
    claims: z.array(claimInputSchema).default([]),
    isDemo: z.boolean().default(false),
  })
  .superRefine((c, ctx) => {
    if (c.key.split(".")[1] !== c.type) {
      ctx.addIssue({ code: "custom", path: ["key"], message: `Key type segment must be "${c.type}"` });
    }
    if (c.compares.length > 0 && c.type !== "comparison") {
      ctx.addIssue({ code: "custom", path: ["compares"], message: "Only comparison concepts list `compares`" });
    }
    if (c.isDemo && c.provenanceKind !== "unverified") {
      ctx.addIssue({ code: "custom", path: ["provenanceKind"], message: "Demo concepts are always 'unverified'" });
    }
  })
  .superRefine(demoRefine("key", "title"));
export type ConceptInput = z.infer<typeof conceptInputSchema>;

export const relationshipTypeSchema = z
  .object({
    code: relationshipTypeCodeSchema,
    label: nonBlank(120),
    inverseLabel: z.string().max(120).nullish(),
    description: nonBlank(2000),
    semantics: relationshipSemanticsSchema,
    directed: z.boolean(),
    allowsCycles: z.boolean(),
    ordered: z.boolean(),
    requiresEvidence: z.boolean(),
    isCore: z.boolean().default(false),
  })
  .superRefine((t, ctx) => {
    if (t.ordered && !(t.directed && t.semantics === "sequential")) {
      ctx.addIssue({ code: "custom", path: ["ordered"], message: "Only directed sequential types are ordered" });
    }
    if (!t.directed && t.inverseLabel) {
      ctx.addIssue({ code: "custom", path: ["inverseLabel"], message: "Undirected types have no inverse label" });
    }
  });
export type RelationshipTypeDefinition = z.infer<typeof relationshipTypeSchema>;

export const relationshipInputSchema = z
  .object({
    sourceConceptId: uuidSchema,
    targetConceptId: uuidSchema,
    typeCode: relationshipTypeCodeSchema,
    explanation: z.string().max(4000).nullish(),
    conditions: z.string().max(4000).nullish(),
    strength: z.number().min(0).max(1).nullish(),
    ordinal: z.number().int().positive().nullish(),
    provenanceKind: provenanceKindSchema,
    sources: z
      .array(
        z.object({
          sourceId: uuidSchema,
          quote: quoteSchema.nullish(),
          locator: z.string().max(200).nullish(),
        }),
      )
      .default([]),
    isDemo: z.boolean().default(false),
  })
  .refine((r) => r.sourceConceptId !== r.targetConceptId, {
    path: ["targetConceptId"],
    message: "A concept cannot relate to itself",
  });
export type RelationshipInput = z.infer<typeof relationshipInputSchema>;

// =========================================================================================
// 3. Knowledge bundle v1 (content_snapshots.payload, knowledge-graph export)
// =========================================================================================

export const KNOWLEDGE_BUNDLE_SCHEMA_VERSION = 1 as const;

/** A located verbatim passage from a cited source (content/FORMAT.md "Claim evidence"). */
export const bundleEvidenceSchema = z.object({ locator: z.string(), quote: z.string(), note: z.string().nullable() });
/**
 * A claim's citation of one source. `evidence` holds the supporting passages in file order;
 * `locator` is the first passage's locator. Snapshots built before evidence existed parse with [].
 */
const bundleSourceRefSchema = z.object({ sourceId: uuidSchema, locator: z.string().nullish(), evidence: z.array(bundleEvidenceSchema).default([]) });

export const bundleCategorySchema = z.object({
  code: knowledgeCategoryCodeSchema,
  label: z.string(),
  templateGroup: z.string(),
  position: z.number().int(),
});

export const bundleRelationshipTypeSchema = z.object({
  code: relationshipTypeCodeSchema,
  label: z.string(),
  inverseLabel: z.string().nullable(),
  semantics: relationshipSemanticsSchema,
  directed: z.boolean(),
  ordered: z.boolean(),
  allowsCycles: z.boolean(),
});

export const bundleTraditionSchema = z.object({
  id: uuidSchema,
  slug: slugSchema,
  name: z.string(),
  altNames: z.array(z.string()),
  summary: z.string().nullable(),
  region: z.object({
    place: z.string().nullable(),
    district: z.string().nullable(),
    state: z.string().nullable(),
    country: z.string().nullable(),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
  }),
  gi: z
    .object({
      registered: z.boolean().nullable(),
      applicationNo: z.string().nullable(),
      year: z.number().int().nullable(),
      sourceIds: z.array(uuidSchema),
    })
    .nullable(),
  verificationState: verificationStateSchema,
});

export const bundleSourceSchema = z.object({
  id: uuidSchema,
  kind: provenanceKindSchema,
  title: z.string(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  year: z.number().int().nullable(),
  url: z.string().nullable(),
  accessedOn: z.string().nullable(),
  reliability: sourceReliabilitySchema.nullable(),
  verificationState: verificationStateSchema,
});

export const bundleConceptSchema = z.object({
  id: uuidSchema,
  key: conceptKeySchema,
  slug: slugSchema,
  type: conceptTypeSchema,
  category: knowledgeCategoryCodeSchema,
  traditionId: uuidSchema.nullable(),
  title: z.string(),
  summary: z.string(),
  body: tiptapDocSchema.nullable(),
  bodyMd: z.string().nullable(),
  localTerms: z.array(z.string()),
  compares: z.array(conceptKeySchema),
  provenanceKind: provenanceKindSchema,
  verificationState: verificationStateSchema,
  claims: z.array(
    z.object({
      id: uuidSchema,
      text: z.string(),
      quote: z.string().nullable(),
      sources: z.array(bundleSourceRefSchema),
    }),
  ),
  assetIds: z.array(uuidSchema).default([]),
});

export const bundleRelationshipSchema = z.object({
  id: uuidSchema,
  source: conceptKeySchema,
  target: conceptKeySchema,
  type: relationshipTypeCodeSchema,
  explanation: z.string().nullable(),
  conditions: z.string().nullable(),
  strength: z.number().nullable(),
  ordinal: z.number().int().nullable(),
  provenanceKind: provenanceKindSchema,
  verificationState: verificationStateSchema,
  sources: z.array(
    z.object({ sourceId: uuidSchema, quote: z.string().nullable(), locator: z.string().nullable() }),
  ),
});

export const knowledgeBundleSchema = z
  .object({
    schemaVersion: z.literal(KNOWLEDGE_BUNDLE_SCHEMA_VERSION),
    versionLabel: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    isDemo: z.boolean(),
    includesUnverified: z.boolean(),
    generatedAt: z.iso.datetime({ offset: true }),
    categories: z.array(bundleCategorySchema),
    relationshipTypes: z.array(bundleRelationshipTypeSchema),
    traditions: z.array(bundleTraditionSchema),
    sources: z.array(bundleSourceSchema),
    concepts: z.array(bundleConceptSchema),
    relationships: z.array(bundleRelationshipSchema),
  })
  .superRefine((b, ctx) => {
    const keys = new Set(b.concepts.map((c) => c.key));
    const types = new Set(b.relationshipTypes.map((t) => t.code));
    const sourceIds = new Set(b.sources.map((s) => s.id));
    const traditionIds = new Set(b.traditions.map((t) => t.id));
    b.concepts.forEach((c, i) => {
      if (c.traditionId && !traditionIds.has(c.traditionId)) {
        ctx.addIssue({ code: "custom", path: ["concepts", i, "traditionId"], message: "Tradition not in bundle" });
      }
      c.claims.forEach((cl, j) =>
        cl.sources.forEach((s, k) => {
          if (!sourceIds.has(s.sourceId)) {
            ctx.addIssue({ code: "custom", path: ["concepts", i, "claims", j, "sources", k], message: "Source not in bundle" });
          }
        }),
      );
    });
    b.relationships.forEach((r, i) => {
      if (!keys.has(r.source) || !keys.has(r.target)) {
        ctx.addIssue({ code: "custom", path: ["relationships", i], message: "Endpoint concept not in bundle" });
      }
      if (!types.has(r.type)) {
        ctx.addIssue({ code: "custom", path: ["relationships", i, "type"], message: "Relationship type not in bundle" });
      }
    });
    if (!b.includesUnverified) {
      const unaccepted = (s: VerificationState) => s !== "verified" && s !== "published";
      if (b.concepts.some((c) => unaccepted(c.verificationState)) || b.relationships.some((r) => unaccepted(r.verificationState))) {
        ctx.addIssue({ code: "custom", path: ["includesUnverified"], message: "Bundle contains unverified content" });
      }
    }
  });
export type KnowledgeBundle = z.infer<typeof knowledgeBundleSchema>;

/** Row describing one entity frozen into a snapshot (snapshot_items). */
export const snapshotItemSchema = z.object({
  itemKind: z.enum(["tradition", "category", "concept", "relationship_type", "relationship", "source", "claim", "asset"]),
  entityRef: z.string().min(1),
  entityKey: z.string().nullish(),
  itemSha256: sha256Schema,
});
export type SnapshotItem = z.infer<typeof snapshotItemSchema>;

/** URL slug derived from a concept key: `bagru.process_stage.washing` -> `bagru-process-stage-washing`. */
export function slugFromConceptKey(key: string): string {
  return key.replace(/[._]/g, "-");
}
