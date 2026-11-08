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
    kind: text().notNull().default("release"),
    schemaVersion: integer().notNull().default(1),
    payload: jsonb().notNull(),
    payloadSha256: text()
      .notNull()
      .generatedAlwaysAs(sql`ie_jsonb_sha256(payload)`),
    itemCount: integer().notNull().default(0),
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
      sql`${t.status} <> 'published' OR (${t.publishedAt} IS NOT NULL AND (${t.publishedBy} IS NOT NULL OR ${t.isDemo}))`,
    ),
    check(
      "content_snapshots_demo_ck",
      sql`${t.isDemo} = (${t.versionLabel} LIKE 'demo%') AND (NOT ${t.isDemo} OR ${t.title} LIKE 'Demo:%')`,
    ),
    check("content_snapshots_kind_ck", sql`${t.kind} IN ('release', 'review')`),
    check("content_snapshots_review_ck", sql`${t.kind} <> 'review' OR (${t.status} = 'draft' AND ${t.includesUnverified})`),
    check("content_snapshots_item_count_ck", sql`${t.itemCount} >= 0`),
  ],
);

export const snapshotItems = pgTable(
  "snapshot_items",
  {
    snapshotId: uuid().notNull(),
    itemKind: snapshotItemKindEnum().notNull(),
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
