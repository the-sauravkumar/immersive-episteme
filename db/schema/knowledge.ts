/**
 * Knowledge domain: the typed craft-knowledge graph shared by both learning conditions.
 *
 *   content_packages ─┬─ traditions ─┬─ tradition_sources ── sources
 *                     ├─ sources     │
 *                     ├─ concepts ───┴─ concept_claims ── concept_claim_sources ── sources
 *                     └─ relationships (concept → concept, typed by relationship_types)
 *                                       └─ relationship_sources ── sources
 *   knowledge_categories (14 reference rows), relationship_types (registry)
 *   verification_records (append-only review history, written by trigger)
 *
 * Lossless with content/FORMAT.md v1: every field of tradition.json maps to a column
 * (see docs/architecture/knowledge-schema.md §"Import mapping").
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  SLUG_RE,
  SHA256_HEX_RE,
  actorId,
  conceptTypeEnum,
  createdAt,
  isDemo,
  pk,
  provenanceKindEnum,
  relationshipSemanticsEnum,
  sourceReliabilityEnum,
  tsvector,
  tsz,
  updatedAt,
  verifiableEntityKindEnum,
  verificationStateEnum,
} from "./_common";

/** Demo rows: unverified provenance, never in an accepted review state. */
const demoGuard = (isDemoCol: AnyPgColumn, prov: AnyPgColumn, state: AnyPgColumn) =>
  sql`NOT ${isDemoCol} OR (${prov} = 'unverified' AND ${state} NOT IN ('verified', 'published'))`;

// ---------------------------------------------------------------------------------------
// Import provenance
// ---------------------------------------------------------------------------------------

/**
 * One interchange file (content/traditions/<slug>/tradition.json, content/shared/*.json) or a
 * CMS-authored collection. Scopes source ids ("S1") and preserves file-level fields.
 */
export const contentPackages = pgTable(
  "content_packages",
  {
    id: pk(),
    slug: text().notNull().unique(),
    kind: text().notNull(), // tradition | shared | comparisons | cms
    formatVersion: integer().notNull().default(1),
    name: text().notNull(),
    altNames: text().array().notNull().default(sql`'{}'::text[]`),
    summary: text(),
    sourcePath: text(),
    fileSha256: text(),
    importedAt: tsz(),
    importedBy: actorId(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("content_packages_id_demo_uq").on(t.id, t.isDemo),
    check("content_packages_slug_ck", sql`${t.slug} ~ ${sql.raw(`'${SLUG_RE}'`)}`),
    check("content_packages_kind_ck", sql`${t.kind} IN ('tradition', 'shared', 'comparisons', 'cms')`),
    check("content_packages_sha_ck", sql`${t.fileSha256} IS NULL OR ${t.fileSha256} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`),
    check("content_packages_demo_ck", sql`${t.isDemo} = (${t.slug} LIKE 'demo%')`),
  ],
);

// ---------------------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------------------

/** The 14 knowledge categories (reference data, seeded; not demo). */
export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    code: text().primaryKey(),
    label: text().notNull(),
    description: text().notNull(),
    /** Which of the seven epistemic-template groups (requirements digest §3) it belongs to. */
    templateGroup: text().notNull(),
    position: smallint().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [check("knowledge_categories_code_ck", sql`${t.code} ~ '^[a-z][a-z_]*$'`)],
);

/**
 * Relationship vocabulary (researcher-editable registry). `semantics` keeps causal,
 * sequential, associative, compositional, explanatory and comparative links distinct.
 */
export const relationshipTypes = pgTable(
  "relationship_types",
  {
    code: text().primaryKey(),
    label: text().notNull(),
    inverseLabel: text(),
    description: text().notNull(),
    semantics: relationshipSemanticsEnum().notNull(),
    directed: boolean().notNull().default(true),
    allowsCycles: boolean().notNull().default(true),
    /** Accepts an `ordinal` (process sequences). */
    ordered: boolean().notNull().default(false),
    /** An edge of this type cannot be verified/published without at least one source. */
    requiresEvidence: boolean().notNull().default(true),
    /** Part of content/FORMAT.md v1 (seeded). */
    isCore: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("relationship_types_code_ck", sql`${t.code} ~ '^[A-Z][A-Z0-9_]*$'`),
    check("relationship_types_ordered_ck", sql`NOT ${t.ordered} OR (${t.directed} AND ${t.semantics} = 'sequential')`),
    check("relationship_types_undirected_ck", sql`${t.directed} OR ${t.inverseLabel} IS NULL`),
  ],
);

// ---------------------------------------------------------------------------------------
// Traditions and sources
// ---------------------------------------------------------------------------------------

export const traditions = pgTable(
  "traditions",
  {
    id: pk(),
    packageId: uuid(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    altNames: text().array().notNull().default(sql`'{}'::text[]`),
    summary: text(),
    regionPlace: text(),
    regionDistrict: text(),
    regionState: text(),
    regionCountry: text(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    giRegistered: boolean(),
    giApplicationNo: text(),
    giYear: integer(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    updatedBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("traditions_id_demo_uq").on(t.id, t.isDemo),
    foreignKey({
      name: "traditions_package_fk",
      columns: [t.packageId, t.isDemo],
      foreignColumns: [contentPackages.id, contentPackages.isDemo],
    }).onDelete("restrict"),
    check("traditions_slug_ck", sql`${t.slug} ~ ${sql.raw(`'${SLUG_RE}'`)}`),
    check("traditions_lat_ck", sql`${t.latitude} IS NULL OR ${t.latitude} BETWEEN -90 AND 90`),
    check("traditions_lon_ck", sql`${t.longitude} IS NULL OR ${t.longitude} BETWEEN -180 AND 180`),
    check("traditions_gi_year_ck", sql`${t.giYear} IS NULL OR ${t.giYear} BETWEEN 1999 AND 2100`),
    check(
      "traditions_demo_ck",
      sql`${t.isDemo} = (${t.slug} LIKE 'demo%') AND (NOT ${t.isDemo} OR (${t.name} LIKE 'Demo:%' AND ${t.verificationState} NOT IN ('verified', 'published')))`,
    ),
  ],
);

/**
 * Bibliographic / testimonial sources. `local_key` is the per-file id ("S1") scoped by
 * package, so imports are idempotent and claims resolve unambiguously.
 */
export const sources = pgTable(
  "sources",
  {
    id: pk(),
    packageId: uuid(),
    localKey: text(),
    kind: provenanceKindEnum().notNull(),
    title: text().notNull(),
    author: text(),
    publisher: text(),
    year: integer(),
    url: text(),
    accessedOn: date(),
    reliability: sourceReliabilityEnum(),
    /** Formatted citation (optional; the structured fields above are authoritative). */
    citation: text(),
    notes: text(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    updatedBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("sources_id_demo_uq").on(t.id, t.isDemo),
    unique("sources_package_local_key_uq").on(t.packageId, t.localKey),
    foreignKey({
      name: "sources_package_fk",
      columns: [t.packageId, t.isDemo],
      foreignColumns: [contentPackages.id, contentPackages.isDemo],
    }).onDelete("restrict"),
    check("sources_year_ck", sql`${t.year} IS NULL OR ${t.year} BETWEEN 0 AND 2100`),
    check("sources_url_ck", sql`${t.url} IS NULL OR ${t.url} ~ '^https?://'`),
    check("sources_local_key_ck", sql`${t.localKey} IS NULL OR ${t.packageId} IS NOT NULL`),
    check("sources_demo_ck", sql`NOT ${t.isDemo} OR ${t.title} LIKE 'Demo:%'`),
    check("sources_demo_state_ck", demoGuard(t.isDemo, t.kind, t.verificationState)),
    index("sources_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
  ],
);

/** Sources backing tradition-level facts (purpose 'gi' = the GI registration record). */
export const traditionSources = pgTable(
  "tradition_sources",
  {
    traditionId: uuid().notNull(),
    sourceId: uuid().notNull(),
    purpose: text().notNull().default("general"),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.traditionId, t.sourceId, t.purpose] }),
    foreignKey({
      name: "tradition_sources_tradition_fk",
      columns: [t.traditionId, t.isDemo],
      foreignColumns: [traditions.id, traditions.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "tradition_sources_source_fk",
      columns: [t.sourceId, t.isDemo],
      foreignColumns: [sources.id, sources.isDemo],
    }).onDelete("restrict"),
    check("tradition_sources_purpose_ck", sql`${t.purpose} IN ('gi', 'summary', 'region', 'general')`),
  ],
);

// ---------------------------------------------------------------------------------------
// Concepts
// ---------------------------------------------------------------------------------------

export const concepts = pgTable(
  "concepts",
  {
    id: pk(),
    /** Stable interchange key `<namespace>.<type>.<kebab-name>` (content/FORMAT.md). */
    key: text().notNull().unique(),
    slug: text().notNull().unique(),
    type: conceptTypeEnum().notNull(),
    categoryCode: text()
      .notNull()
      .references(() => knowledgeCategories.code, { onDelete: "restrict", onUpdate: "cascade" }),
    traditionId: uuid(),
    packageId: uuid(),
    title: text().notNull(),
    summary: text().notNull().default(""),
    /** Rich body as a Tiptap/ProseMirror JSON document (CMS-authored). */
    body: jsonb(),
    /** Plain-markdown body as imported (content/FORMAT.md `body_md`). */
    bodyMd: text(),
    localTerms: text().array().notNull().default(sql`'{}'::text[]`),
    /**
     * `comparison` concepts only: keys of the concepts being compared (content/FORMAT.md
     * `compares`, used by content/comparisons.json). Kept as keys so the import is lossless
     * even before every compared concept exists; the importer also emits CONTRASTS_WITH /
     * SIMILAR_TO relationships for navigation.
     */
    compares: text().array().notNull().default(sql`'{}'::text[]`),
    provenanceKind: provenanceKindEnum().notNull(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    isDemo: isDemo(),
    /** Full-text vector (immutable wrapper defined in migration 0001). */
    search: tsvector().generatedAlwaysAs(
      sql`ie_concept_search_vector(title, summary, local_terms, body_md)`,
    ),
    createdBy: actorId(),
    updatedBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("concepts_id_demo_uq").on(t.id, t.isDemo),
    foreignKey({
      name: "concepts_tradition_fk",
      columns: [t.traditionId, t.isDemo],
      foreignColumns: [traditions.id, traditions.isDemo],
    }).onDelete("restrict"),
    foreignKey({
      name: "concepts_package_fk",
      columns: [t.packageId, t.isDemo],
      foreignColumns: [contentPackages.id, contentPackages.isDemo],
    }).onDelete("restrict"),
    check(
      "concepts_key_ck",
      sql`${t.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*\\.[a-z_]+\\.[a-z0-9]+(-[a-z0-9]+)*$' AND split_part(${t.key}, '.', 2) = ${t.type}::text`,
    ),
    check("concepts_slug_ck", sql`${t.slug} ~ ${sql.raw(`'${SLUG_RE}'`)}`),
    check("concepts_title_ck", sql`length(btrim(${t.title})) > 0`),
    check("concepts_body_ck", sql`${t.body} IS NULL OR (jsonb_typeof(${t.body}) = 'object' AND ${t.body}->>'type' = 'doc')`),
    check(
      "concepts_demo_ck",
      sql`${t.isDemo} = (${t.key} LIKE 'demo%') AND (NOT ${t.isDemo} OR ${t.title} LIKE 'Demo:%')`,
    ),
    check("concepts_demo_state_ck", demoGuard(t.isDemo, t.provenanceKind, t.verificationState)),
    check("concepts_compares_ck", sql`cardinality(${t.compares}) = 0 OR ${t.type} = 'comparison'`),
    index("concepts_type_idx").on(t.type),
    index("concepts_category_idx").on(t.categoryCode),
    index("concepts_tradition_idx").on(t.traditionId),
    index("concepts_state_idx").on(t.verificationState),
    index("concepts_title_trgm_idx").using("gin", t.title.op("gin_trgm_ops")),
    index("concepts_search_idx").using("gin", t.search),
    index("concepts_local_terms_idx").using("gin", t.localTerms),
  ],
);

/** A sourced statement about a concept (content/FORMAT.md `claims[]`). */
export const conceptClaims = pgTable(
  "concept_claims",
  {
    id: pk(),
    conceptId: uuid().notNull(),
    position: smallint().notNull(),
    text: text().notNull(),
    /** Verbatim quote, at most 25 words (FORMAT.md). */
    quote: text(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("concept_claims_id_demo_uq").on(t.id, t.isDemo),
    unique("concept_claims_position_uq").on(t.conceptId, t.position),
    foreignKey({
      name: "concept_claims_concept_fk",
      columns: [t.conceptId, t.isDemo],
      foreignColumns: [concepts.id, concepts.isDemo],
    }).onDelete("cascade"),
    check("concept_claims_text_ck", sql`length(btrim(${t.text})) > 0`),
    check("concept_claims_position_ck", sql`${t.position} >= 0`),
    check(
      "concept_claims_quote_ck",
      sql`${t.quote} IS NULL OR array_length(regexp_split_to_array(btrim(${t.quote}), '\\s+'), 1) <= 25`,
    ),
  ],
);

export const conceptClaimSources = pgTable(
  "concept_claim_sources",
  {
    claimId: uuid().notNull(),
    sourceId: uuid().notNull(),
    /** Page, timestamp or section within the source. */
    locator: text(),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.sourceId] }),
    foreignKey({
      name: "concept_claim_sources_claim_fk",
      columns: [t.claimId, t.isDemo],
      foreignColumns: [conceptClaims.id, conceptClaims.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "concept_claim_sources_source_fk",
      columns: [t.sourceId, t.isDemo],
      foreignColumns: [sources.id, sources.isDemo],
    }).onDelete("restrict"),
    index("concept_claim_sources_source_idx").on(t.sourceId),
  ],
);

// ---------------------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------------------

export const relationships = pgTable(
  "relationships",
  {
    id: pk(),
    sourceConceptId: uuid().notNull(),
    targetConceptId: uuid().notNull(),
    typeCode: text()
      .notNull()
      .references(() => relationshipTypes.code, { onDelete: "restrict", onUpdate: "cascade" }),
    packageId: uuid(),
    /** Why the relation holds. */
    explanation: text(),
    /** Qualifications under which it holds. */
    conditions: text(),
    /** Optional researcher-assigned strength in [0, 1]. */
    strength: doublePrecision(),
    /** Position within an ordered sequence (types with `ordered = true`, e.g. PRECEDES). */
    ordinal: integer(),
    provenanceKind: provenanceKindEnum().notNull(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    updatedBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("relationships_id_demo_uq").on(t.id, t.isDemo),
    unique("relationships_edge_uq").on(t.sourceConceptId, t.targetConceptId, t.typeCode),
    foreignKey({
      name: "relationships_source_fk",
      columns: [t.sourceConceptId, t.isDemo],
      foreignColumns: [concepts.id, concepts.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "relationships_target_fk",
      columns: [t.targetConceptId, t.isDemo],
      foreignColumns: [concepts.id, concepts.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "relationships_package_fk",
      columns: [t.packageId, t.isDemo],
      foreignColumns: [contentPackages.id, contentPackages.isDemo],
    }).onDelete("restrict"),
    check("relationships_no_self_loop_ck", sql`${t.sourceConceptId} <> ${t.targetConceptId}`),
    check("relationships_strength_ck", sql`${t.strength} IS NULL OR (${t.strength} >= 0 AND ${t.strength} <= 1)`),
    check("relationships_ordinal_ck", sql`${t.ordinal} IS NULL OR ${t.ordinal} > 0`),
    check("relationships_demo_state_ck", demoGuard(t.isDemo, t.provenanceKind, t.verificationState)),
    index("relationships_target_idx").on(t.targetConceptId),
    index("relationships_type_idx").on(t.typeCode),
    index("relationships_state_idx").on(t.verificationState),
  ],
);

export const relationshipSources = pgTable(
  "relationship_sources",
  {
    relationshipId: uuid().notNull(),
    sourceId: uuid().notNull(),
    quote: text(),
    locator: text(),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.relationshipId, t.sourceId] }),
    foreignKey({
      name: "relationship_sources_relationship_fk",
      columns: [t.relationshipId, t.isDemo],
      foreignColumns: [relationships.id, relationships.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "relationship_sources_source_fk",
      columns: [t.sourceId, t.isDemo],
      foreignColumns: [sources.id, sources.isDemo],
    }).onDelete("restrict"),
    index("relationship_sources_source_idx").on(t.sourceId),
    check(
      "relationship_sources_quote_ck",
      sql`${t.quote} IS NULL OR array_length(regexp_split_to_array(btrim(${t.quote}), '\\s+'), 1) <= 25`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------
// Review history
// ---------------------------------------------------------------------------------------

/**
 * Append-only review history. Rows are written by the `ie_record_verification` trigger on
 * every verification_state change; the actor/reason come from the transaction-local settings
 * `app.actor_id` / `app.change_reason` (set by the CMS service). Accepting content
 * (verified/published) without an actor is rejected.
 */
export const verificationRecords = pgTable(
  "verification_records",
  {
    id: pk(),
    entityKind: verifiableEntityKindEnum().notNull(),
    entityId: uuid().notNull(),
    fromState: verificationStateEnum(),
    toState: verificationStateEnum().notNull(),
    actorId: actorId(),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("verification_records_entity_idx").on(t.entityKind, t.entityId, t.createdAt),
    check(
      "verification_records_actor_ck",
      sql`${t.toState} NOT IN ('verified', 'published') OR ${t.actorId} IS NOT NULL`,
    ),
  ],
);
