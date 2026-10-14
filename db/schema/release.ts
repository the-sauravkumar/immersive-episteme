/**
 * Releases and parity evidence.
 *
 * - release_manifests: what was deployed for a study: content snapshot + spatial manifest +
 *   app build.
 * - parity_reports: append-only content-parity validation reports (spec "experimental
 *   equivalence must be implemented, not assumed"). Rows can never be edited or deleted.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { actorId, createdAt, isDemo, pk, releaseStatusEnum, tsz } from "./_common";
import { contentSnapshots } from "./publishing";
import { spatialManifests } from "./spatial";

export const releaseManifests = pgTable(
  "release_manifests",
  {
    id: pk(),
    versionLabel: text().notNull().unique(),
    snapshotId: uuid().notNull(),
    spatialManifestId: uuid(),
    appBuild: text().notNull(),
    /**
     * Database server + extension versions at release time ({ serverVersion, extensions }),
     * stamped by trigger on INSERT (migration 0005) so a release records the exact
     * PostgreSQL/pgvector the migrations ran on. Frozen with the release.
     */
    dbEnvironment: jsonb().notNull().default(sql`'{}'::jsonb`),
    notes: text(),
    status: releaseStatusEnum().notNull().default("candidate"),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    releasedBy: actorId(),
    releasedAt: tsz(),
  },
  (t) => [
    unique("release_manifests_id_demo_uq").on(t.id, t.isDemo),
    foreignKey({
      name: "release_manifests_snapshot_fk",
      columns: [t.snapshotId, t.isDemo],
      foreignColumns: [contentSnapshots.id, contentSnapshots.isDemo],
    }).onDelete("restrict"),
    foreignKey({
      name: "release_manifests_manifest_fk",
      columns: [t.spatialManifestId, t.isDemo],
      foreignColumns: [spatialManifests.id, spatialManifests.isDemo],
    }).onDelete("restrict"),
    check(
      "release_manifests_released_ck",
      sql`${t.status} = 'candidate' OR ${t.releasedAt} IS NOT NULL`,
    ),
  ],
);

export const parityReports = pgTable(
  "parity_reports",
  {
    id: pk(),
    snapshotId: uuid().notNull(),
    spatialManifestId: uuid(),
    releaseManifestId: uuid().references(() => releaseManifests.id, { onDelete: "restrict" }),
    generatorVersion: text().notNull(),
    passed: boolean().notNull(),
    /** Per-check results: [{ id, label, passed, details }]. */
    checks: jsonb().notNull(),
    report: jsonb().notNull(),
    reportSha256: text()
      .notNull()
      .generatedAlwaysAs(sql`ie_jsonb_sha256(report)`),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "parity_reports_snapshot_fk",
      columns: [t.snapshotId, t.isDemo],
      foreignColumns: [contentSnapshots.id, contentSnapshots.isDemo],
    }).onDelete("restrict"),
    foreignKey({
      name: "parity_reports_manifest_fk",
      columns: [t.spatialManifestId, t.isDemo],
      foreignColumns: [spatialManifests.id, spatialManifests.isDemo],
    }).onDelete("restrict"),
    check("parity_reports_checks_ck", sql`jsonb_typeof(${t.checks}) = 'array'`),
    index("parity_reports_snapshot_idx").on(t.snapshotId, t.createdAt),
  ],
);
