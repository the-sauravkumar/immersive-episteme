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

const demoGuard = (isDemoCol: AnyPgColumn, prov: AnyPgColumn, state: AnyPgColumn) =>
  sql`NOT ${isDemoCol} OR (${prov} = 'unverified' AND ${state} NOT IN ('verified', 'published'))`;

export const contentPackages = pgTable(
  "content_packages",
  {
    id: pk(),
    slug: text().notNull().unique(),
    kind: text().notNull(),
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

export const knowledgeCategories = pgTable(
  "knowledge_categories",
  {
    code: text().primaryKey(),
    label: text().notNull(),
    description: text().notNull(),
    templateGroup: text().notNull(),
    position: smallint().notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [check("knowledge_categories_code_ck", sql`${t.code} ~ '^[a-z][a-z_]*$'`)],
);

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
    ordered: boolean().notNull().default(false),
    requiresEvidence: boolean().notNull().default(true),
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

export const concepts = pgTable(
  "concepts",
  {
    id: pk(),
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
    body: jsonb(),
    bodyMd: text(),
    localTerms: text().array().notNull().default(sql`'{}'::text[]`),
    compares: text().array().notNull().default(sql`'{}'::text[]`),
    provenanceKind: provenanceKindEnum().notNull(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    isDemo: isDemo(),
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

export const conceptClaims = pgTable(
  "concept_claims",
  {
    id: pk(),
    conceptId: uuid().notNull(),
    position: smallint().notNull(),
    text: text().notNull(),
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
    locator: text(),
    evidence: jsonb().$type<{ locator: string; quote: string; note?: string | null }[]>().notNull().default([]),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.claimId, t.sourceId] }),
    check("concept_claim_sources_evidence_ck", sql`jsonb_typeof(${t.evidence}) = 'array'`),
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
    explanation: text(),
    conditions: text(),
    strength: doublePrecision(),
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
