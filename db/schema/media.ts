/**
 * Media: stored binary assets (object-storage key + checksum), their versions/derivatives,
 * links to concepts, and imported media candidates (content/FORMAT.md `media_candidates`)
 * awaiting licence review.
 *
 * Figure governance (DESIGN.md 9.9, 11.10, 12.3, 16; DR-018, DR-020; migration 0016):
 *  - `maxPixels`: the longest side, in px, the licence allows the platform to display (the V&A
 *    terms allow 768). NULL = the licence sets no cap.
 *  - `licenceExpiresOn`: the last day the licence permits use (the V&A term is five years from
 *    first publication). NULL = no expiry. The learner figure route refuses an asset after it.
 *  - `publicPlate`: cleared for public-page plates as well as study figures.
 *  - `licenceTermMonths` (migration 0017): a licence term that runs from first publication (the
 *    V&A term is 60 months). NULL = no such term.
 *  - `firstPublishedOn` (migration 0017): the day the asset first became visible to learners or on
 *    a public plate, stamped once and never changed (DR-020: "recorded on each asset when it is
 *    first published"). With a term, it also sets `licenceExpiresOn` (the day before the term's
 *    anniversary), and the learner route refuses a termed asset that has no stamp.
 *  - `sourceUrl` (already present): the record page the file was obtained from.
 *  - `asset_links.position` of an `illustration` link is the anchor claim index: the zero-based
 *    position of the claim the figure renders after, in both conditions.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  SHA256_HEX_RE,
  actorId,
  assetKindEnum,
  assetLinkRoleEnum,
  createdAt,
  isDemo,
  mediaCandidateStatusEnum,
  pk,
  provenanceKindEnum,
  updatedAt,
  verificationStateEnum,
} from "./_common";
import { concepts, contentPackages, sources } from "./knowledge";
import { contentSnapshots } from "./publishing";

const SHA = sql.raw(`'${SHA256_HEX_RE}'`);
const MIME = sql.raw(`'^[a-z]+/[a-z0-9][a-z0-9.+-]*$'`);

export const assets = pgTable(
  "assets",
  {
    id: pk(),
    kind: assetKindEnum().notNull(),
    title: text().notNull(),
    storageKey: text().notNull().unique(),
    mimeType: text().notNull(),
    byteSize: bigint({ mode: "number" }).notNull(),
    sha256: text().notNull(),
    width: integer(),
    height: integer(),
    durationMs: integer(),
    /** Required for images and textures; '' marks a purely decorative image. */
    altText: text(),
    caption: text(),
    credit: text(),
    licence: text(),
    licenceUrl: text(),
    sourceUrl: text(),
    sourceId: uuid(),
    /** Longest side (px) the licence allows on screen; NULL = no cap. */
    maxPixels: integer(),
    /** Last day the licence permits use; NULL = no expiry. */
    licenceExpiresOn: date({ mode: "string" }),
    /** Cleared for public-page plates (study figures need no flag). */
    publicPlate: boolean().notNull().default(false),
    /** Licence term in months counted from first publication (V&A: 60); NULL = none. */
    licenceTermMonths: smallint(),
    /** First day the asset was visible to learners or on a public plate; stamped once. */
    firstPublishedOn: date({ mode: "string" }),
    provenanceKind: provenanceKindEnum().notNull(),
    verificationState: verificationStateEnum().notNull().default("draft"),
    currentVersion: integer().notNull().default(1),
    isDemo: isDemo(),
    createdBy: actorId(),
    updatedBy: actorId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("assets_id_demo_uq").on(t.id, t.isDemo),
    foreignKey({
      name: "assets_source_fk",
      columns: [t.sourceId, t.isDemo],
      foreignColumns: [sources.id, sources.isDemo],
    }).onDelete("restrict"),
    check("assets_sha_ck", sql`${t.sha256} ~ ${SHA}`),
    check("assets_mime_ck", sql`${t.mimeType} ~ ${MIME}`),
    check("assets_size_ck", sql`${t.byteSize} > 0`),
    check("assets_dims_ck", sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`),
    check("assets_duration_ck", sql`${t.durationMs} IS NULL OR ${t.durationMs} >= 0`),
    check("assets_max_pixels_ck", sql`${t.maxPixels} IS NULL OR ${t.maxPixels} > 0`),
    check("assets_licence_term_ck", sql`${t.licenceTermMonths} IS NULL OR ${t.licenceTermMonths} > 0`),
    check("assets_alt_ck", sql`${t.kind} NOT IN ('image', 'texture') OR ${t.altText} IS NOT NULL`),
    check(
      "assets_accepted_licence_ck",
      sql`${t.verificationState} NOT IN ('verified', 'published') OR ${t.licence} IS NOT NULL`,
    ),
    check(
      "assets_demo_ck",
      sql`NOT ${t.isDemo} OR (${t.title} LIKE 'Demo:%' AND ${t.provenanceKind} = 'unverified' AND ${t.verificationState} NOT IN ('verified', 'published'))`,
    ),
    check("assets_current_version_ck", sql`${t.currentVersion} > 0`),
    index("assets_sha_idx").on(t.sha256),
  ],
);

/** Immutable derivatives / revisions of an asset (original, web, thumb, ktx2, draco...). */
export const assetVersions = pgTable(
  "asset_versions",
  {
    id: pk(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    variant: text().notNull().default("original"),
    storageKey: text().notNull().unique(),
    mimeType: text().notNull(),
    byteSize: bigint({ mode: "number" }).notNull(),
    sha256: text().notNull(),
    width: integer(),
    height: integer(),
    createdBy: actorId(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("asset_versions_uq").on(t.assetId, t.version, t.variant),
    check("asset_versions_version_ck", sql`${t.version} > 0`),
    check("asset_versions_variant_ck", sql`${t.variant} ~ '^[a-z0-9_-]+$'`),
    check("asset_versions_sha_ck", sql`${t.sha256} ~ ${SHA}`),
    check("asset_versions_mime_ck", sql`${t.mimeType} ~ ${MIME}`),
    check("asset_versions_size_ck", sql`${t.byteSize} > 0`),
  ],
);

export const assetLinks = pgTable(
  "asset_links",
  {
    id: pk(),
    assetId: uuid().notNull(),
    conceptId: uuid().notNull(),
    role: assetLinkRoleEnum().notNull().default("illustration"),
    position: smallint().notNull().default(0),
    captionOverride: text(),
    isDemo: isDemo(),
    createdAt: createdAt(),
  },
  (t) => [
    unique("asset_links_uq").on(t.assetId, t.conceptId, t.role),
    /** For `illustration` links, position = the anchor claim index (zero-based). */
    check("asset_links_position_ck", sql`${t.position} >= 0`),
    foreignKey({
      name: "asset_links_asset_fk",
      columns: [t.assetId, t.isDemo],
      foreignColumns: [assets.id, assets.isDemo],
    }).onDelete("cascade"),
    foreignKey({
      name: "asset_links_concept_fk",
      columns: [t.conceptId, t.isDemo],
      foreignColumns: [concepts.id, concepts.isDemo],
    }).onDelete("cascade"),
    index("asset_links_concept_idx").on(t.conceptId, t.position),
  ],
);

/**
 * The study photographs frozen into a RELEASE snapshot (migration 0019; final review knowledge-01,
 * database-01, security-02). `publishRelease` copies every illustration that is servable at
 * publication, with exactly what a learner sees (the anchor claim index and the resolved caption,
 * alt text, credit and licence lines, the pixel size and the file's sha256), while the snapshot is
 * still a draft; publishing freezes the rows (triggers in 0019). The read model serves a released
 * study's photographs only from here, so a caption edit, a re-anchored or new link, or a replaced
 * file never changes what a running study shows. Only removals stay live: the licence (expiry,
 * display cap, first-publication stamp) and a reviewer's withdrawal of the asset.
 */
export const snapshotFigures = pgTable(
  "snapshot_figures",
  {
    snapshotId: uuid()
      .notNull()
      .references(() => contentSnapshots.id, { onDelete: "cascade" }),
    conceptId: uuid().notNull(),
    assetId: uuid()
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    /** The anchor claim index (zero-based) in the snapshot's own claim list. */
    position: smallint().notNull(),
    caption: text().notNull(),
    altText: text().notNull(),
    credit: text().notNull(),
    licence: text().notNull(),
    licenceUrl: text(),
    width: integer().notNull(),
    height: integer().notNull(),
    /** sha256 of the file at publication; a different file is never shown under this record. */
    sha256: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.conceptId, t.assetId] }),
    check("snapshot_figures_position_ck", sql`${t.position} >= 0`),
    check("snapshot_figures_dims_ck", sql`${t.width} > 0 AND ${t.height} > 0`),
    check("snapshot_figures_sha_ck", sql`${t.sha256} ~ ${SHA}`),
    check(
      "snapshot_figures_text_ck",
      sql`btrim(${t.caption}) <> '' AND btrim(${t.altText}) <> '' AND btrim(${t.credit}) <> '' AND btrim(${t.licence}) <> ''`,
    ),
    index("snapshot_figures_asset_idx").on(t.assetId),
  ],
);

/** Media referenced by imported content but not yet licence-checked or stored. */
export const mediaCandidates = pgTable(
  "media_candidates",
  {
    id: pk(),
    packageId: uuid(),
    url: text().notNull(),
    title: text().notNull(),
    licence: text(),
    author: text(),
    /** Concept key as given in the file (`depicts`), kept even if the concept is missing. */
    depictsKey: text(),
    depictsConceptId: uuid(),
    /** Source pixel size from the file (FORMAT.md), so renderers keep the true aspect ratio. */
    width: integer(),
    height: integer(),
    mimeType: text(),
    /** Where width/height came from, e.g. "Wikimedia Commons API imageinfo (2026-10-14)". */
    dimensionsSource: text(),
    status: mediaCandidateStatusEnum().notNull().default("candidate"),
    assetId: uuid(),
    notes: text(),
    isDemo: isDemo(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("media_candidates_uq").on(t.packageId, t.url, t.depictsKey).nullsNotDistinct(),
    foreignKey({
      name: "media_candidates_package_fk",
      columns: [t.packageId, t.isDemo],
      foreignColumns: [contentPackages.id, contentPackages.isDemo],
    }).onDelete("cascade"),
    // Single-column FKs: a composite FK with SET NULL would also null is_demo.
    foreignKey({
      name: "media_candidates_concept_fk",
      columns: [t.depictsConceptId],
      foreignColumns: [concepts.id],
    }).onDelete("set null"),
    foreignKey({
      name: "media_candidates_asset_fk",
      columns: [t.assetId],
      foreignColumns: [assets.id],
    }).onDelete("set null"),
    check("media_candidates_url_ck", sql`${t.url} ~ '^https?://'`),
    check("media_candidates_dims_ck", sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`),
    check("media_candidates_mime_ck", sql`${t.mimeType} IS NULL OR ${t.mimeType} ~ ${MIME}`),
    check("media_candidates_imported_ck", sql`${t.status} <> 'imported' OR ${t.assetId} IS NOT NULL`),
  ],
);
