/**
 * Publishing: immutable content snapshots. A study binds to exactly one snapshot, so both
 * learning conditions provably read the same knowledge bundle.
 *
 * Immutability (migration 0003 triggers):
 *  - a `published` snapshot rejects every UPDATE and DELETE;
 *  - its snapshot_items reject INSERT/UPDATE/DELETE;
 *  - a non-demo snapshot cannot contain demo entities, and (unless `includes_unverified`)
 *    only verified/published concepts, relationships and sources.
 * Publication (migration 0005): a snapshot is inserted as draft and published by UPDATE only
 * after its payload header matches the row, the payload's entity set equals its items, every
 * item is rechecked against the LIVE entity (demo flag, review state), `item_sha256` is set to
 * the sha256 of the item's payload slice (caller values are overwritten) and `item_count` is
 * recounted. None of the three tables can be truncated.
 *
 * `payload_sha256` is a generated column: sha256 of the payload's canonical jsonb text
 * (PostgreSQL normalises jsonb key order), so the hash can never drift from the payload.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  SHA256_HEX_RE,
  actorId,
  createdAt,
  isDemo,
  pk,
  snapshotItemKindEnum,
  snapshotStatusEnum,
  tsz,
} from "./_common";

export const contentSnapshots = pgTable(
  "content_snapshots",
  {
    id: pk(),
    versionLabel: text().notNull().unique(),
    title: text().notNull(),
    description: text(),
    status: snapshotStatusEnum().notNull().default("draft"),
    /** Snapshot bundle format version (see src/features/knowledge/contracts.ts). */
    schemaVersion: integer().notNull().default(1),
    payload: jsonb().notNull(),
    payloadSha256: text()
      .notNull()
      .generatedAlwaysAs(sql`ie_jsonb_sha256(payload)`),
    itemCount: integer().notNull().default(0),
    /** True when a researcher explicitly allowed non-verified content (recorded in exports). */
    includesUnverified: boolean().notNull().default(false),
    isDemo: isDemo(),
    createdBy: actorId(),
    createdAt: createdAt(),
    publishedBy: actorId(),
    publishedAt: tsz(),
  },
  (t) => [
    unique("content_snapshots_id_demo_uq").on(t.id, t.isDemo),
    check("content_snapshots_label_ck", sql`${t.versionLabel} ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'`),
    check("content_snapshots_payload_ck", sql`jsonb_typeof(${t.payload}) = 'object'`),
    check(
      "content_snapshots_published_ck",
      // Demo snapshots may be published by the seed script (no human actor); real ones may not.
      sql`${t.status} <> 'published' OR (${t.publishedAt} IS NOT NULL AND (${t.publishedBy} IS NOT NULL OR ${t.isDemo}))`,
    ),
    check(
      "content_snapshots_demo_ck",
      sql`${t.isDemo} = (${t.versionLabel} LIKE 'demo%') AND (NOT ${t.isDemo} OR ${t.title} LIKE 'Demo:%')`,
    ),
    check("content_snapshots_item_count_ck", sql`${t.itemCount} >= 0`),
  ],
);

/** Index of the entities frozen into a snapshot (for traceability and parity queries). */
export const snapshotItems = pgTable(
  "snapshot_items",
  {
    snapshotId: uuid().notNull(),
    itemKind: snapshotItemKindEnum().notNull(),
    /** uuid of the source row (concept, relationship, ...); category/type rows use their code. */
    entityRef: text().notNull(),
    entityKey: text(),
    itemSha256: text().notNull(),
    isDemo: isDemo(),
  },
  (t) => [
    primaryKey({ columns: [t.snapshotId, t.itemKind, t.entityRef] }),
    foreignKey({
      name: "snapshot_items_snapshot_fk",
      columns: [t.snapshotId, t.isDemo],
      foreignColumns: [contentSnapshots.id, contentSnapshots.isDemo],
    }).onDelete("cascade"),
    check("snapshot_items_sha_ck", sql`${t.itemSha256} ~ ${sql.raw(`'${SHA256_HEX_RE}'`)}`),
    index("snapshot_items_entity_idx").on(t.itemKind, t.entityRef),
  ],
);
