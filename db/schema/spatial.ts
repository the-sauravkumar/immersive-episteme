import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorId,
  createdAt,
  isDemo,
  manifestStatusEnum,
  pk,
  requiredActorId,
  ruleSetStatusEnum,
  spatialElementKindEnum,
  tsz,
} from "./_common";
import { concepts, relationships } from "./knowledge";
import { contentSnapshots } from "./publishing";

export const mappingRuleSets = pgTable(
  "mapping_rule_sets",
  {
    id: pk(),
    name: text().notNull(),
    version: integer().notNull(),
    description: text(),
    config: jsonb().notNull(),
    configSha256: text()
      .notNull()
      .generatedAlwaysAs(sql`ie_jsonb_sha256(config)`),
    status: ruleSetStatusEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    frozenBy: actorId(),
    frozenAt: tsz(),
  },
  (t) => [
    unique("mapping_rule_sets_id_demo_uq").on(t.id, t.isDemo),
    unique("mapping_rule_sets_name_version_uq").on(t.name, t.version),
    check("mapping_rule_sets_version_ck", sql`${t.version} > 0`),
    check("mapping_rule_sets_config_ck", sql`jsonb_typeof(${t.config}) = 'object'`),
    check("mapping_rule_sets_frozen_ck", sql`${t.status} <> 'frozen' OR ${t.frozenAt} IS NOT NULL`),
    check("mapping_rule_sets_demo_ck", sql`NOT ${t.isDemo} OR ${t.name} LIKE 'Demo:%'`),
  ],
);

export const manualOverrides = pgTable(
  "manual_overrides",
  {
    id: pk(),
    ruleSetId: uuid().notNull(),
    targetElementId: text().notNull(),
    targetConceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    field: text().notNull(),
    value: jsonb().notNull(),
    reason: text().notNull(),
    isDemo: isDemo(),
    createdBy: requiredActorId(),
    createdAt: createdAt(),
    revokedBy: actorId(),
    revokedAt: tsz(),
    revokeReason: text(),
  },
  (t) => [
    foreignKey({
      name: "manual_overrides_rule_set_fk",
      columns: [t.ruleSetId, t.isDemo],
      foreignColumns: [mappingRuleSets.id, mappingRuleSets.isDemo],
    }).onDelete("restrict"),
    check("manual_overrides_reason_ck", sql`length(btrim(${t.reason})) >= 3`),
    check("manual_overrides_field_ck", sql`${t.field} ~ '^(/[^/]+)+$'`),
    check(
      "manual_overrides_revoke_ck",
      sql`(${t.revokedAt} IS NULL) = (${t.revokedBy} IS NULL) AND (${t.revokedAt} IS NULL OR ${t.revokeReason} IS NOT NULL)`,
    ),
    index("manual_overrides_rule_set_idx").on(t.ruleSetId),
  ],
);

export const spatialManifests = pgTable(
  "spatial_manifests",
  {
    id: pk(),
    snapshotId: uuid().notNull(),
    ruleSetId: uuid().notNull(),
    compilerVersion: text().notNull(),
    seed: text().notNull(),
    traditions: text().array().notNull().default(sql`'{}'::text[]`),
    manifest: jsonb().notNull(),
    manifestHash: text()
      .notNull()
      .generatedAlwaysAs(sql`ie_jsonb_sha256(manifest)`),
    validation: jsonb().notNull().default(sql`'{}'::jsonb`),
    status: manifestStatusEnum().notNull().default("draft"),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    publishedBy: actorId(),
    publishedAt: tsz(),
  },
  (t) => [
    unique("spatial_manifests_id_demo_uq").on(t.id, t.isDemo),
    unique("spatial_manifests_inputs_uq").on(t.snapshotId, t.ruleSetId, t.compilerVersion, t.seed, t.traditions),
    foreignKey({
      name: "spatial_manifests_snapshot_fk",
      columns: [t.snapshotId, t.isDemo],
      foreignColumns: [contentSnapshots.id, contentSnapshots.isDemo],
    }).onDelete("restrict"),
    foreignKey({
      name: "spatial_manifests_rule_set_fk",
      columns: [t.ruleSetId, t.isDemo],
      foreignColumns: [mappingRuleSets.id, mappingRuleSets.isDemo],
    }).onDelete("restrict"),
    check("spatial_manifests_manifest_ck", sql`jsonb_typeof(${t.manifest}) = 'object'`),
    check(
      "spatial_manifests_published_ck",
      sql`${t.status} NOT IN ('published', 'superseded') OR ${t.publishedAt} IS NOT NULL`,
    ),
    check("spatial_manifests_compiler_ck", sql`length(${t.compilerVersion}) > 0`),
  ],
);

export const spatialElements = pgTable(
  "spatial_elements",
  {
    id: pk(),
    manifestId: uuid()
      .notNull()
      .references(() => spatialManifests.id, { onDelete: "cascade" }),
    elementId: text().notNull(),
    kind: spatialElementKindEnum().notNull(),
    parentElementId: text(),
    conceptId: uuid().references(() => concepts.id, { onDelete: "restrict" }),
    ruleId: text().notNull(),
    label: text(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("spatial_elements_manifest_element_uq").on(t.manifestId, t.elementId),
    index("spatial_elements_concept_idx").on(t.conceptId),
    index("spatial_elements_rule_idx").on(t.manifestId, t.ruleId),
  ],
);

export const spatialElementEncodings = pgTable(
  "spatial_element_encodings",
  {
    id: pk(),
    manifestId: uuid()
      .notNull()
      .references(() => spatialManifests.id, { onDelete: "cascade" }),
    elementId: text().notNull(),
    relationshipId: uuid()
      .notNull()
      .references(() => relationships.id, { onDelete: "restrict" }),
    ruleId: text().notNull(),
    encoding: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("spatial_element_encodings_uq").on(t.manifestId, t.elementId, t.relationshipId, t.ruleId),
    foreignKey({
      name: "spatial_element_encodings_element_fk",
      columns: [t.manifestId, t.elementId],
      foreignColumns: [spatialElements.manifestId, spatialElements.elementId],
    }).onDelete("cascade"),
    index("spatial_element_encodings_relationship_idx").on(t.relationshipId),
  ],
);
