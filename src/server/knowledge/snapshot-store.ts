/**
 * Database access behind the knowledge read model: load a readable snapshot payload by id, and
 * search inside one snapshot with PostgreSQL full-text search plus trigram similarity.
 *
 * Not `server-only` (integration tests run it against throwaway databases); application code
 * goes through src/server/knowledge/read-model.ts, which adds caching.
 *
 * Readable snapshots: `published` snapshots and `review` snapshots. Both are immutable (a
 * published row by trigger, a review row because it can never be published and the importer
 * never rewrites it; its label is its content hash). A draft `release` snapshot is still being
 * assembled by the CMS and is refused, so cached reads can never go stale.
 */
import type { Pool, PoolClient } from "pg";

import { knowledgeBundleSchema, type KnowledgeBundle } from "@/features/knowledge/contracts";

type Q = Pick<Pool | PoolClient, "query">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SnapshotNotReadableError extends Error {
  constructor(
    readonly snapshotId: string,
    readonly reason: "not_found" | "draft_release" | "invalid_payload",
  ) {
    super(`Snapshot ${snapshotId} is not readable (${reason})`);
    this.name = "SnapshotNotReadableError";
  }
}

export interface SnapshotRow {
  id: string;
  versionLabel: string;
  kind: "release" | "review";
  status: "draft" | "published";
  isDemo: boolean;
  includesUnverified: boolean;
  payloadSha256: string;
}

export async function loadSnapshotRow(q: Q, snapshotId: string): Promise<SnapshotRow | null> {
  if (!UUID_RE.test(snapshotId)) return null;
  const r = await q.query<{ id: string; version_label: string; kind: "release" | "review"; status: "draft" | "published"; is_demo: boolean; includes_unverified: boolean; payload_sha256: string }>(
    "SELECT id, version_label, kind, status, is_demo, includes_unverified, payload_sha256 FROM content_snapshots WHERE id = $1",
    [snapshotId],
  );
  const row = r.rows[0];
  return row
    ? { id: row.id, versionLabel: row.version_label, kind: row.kind, status: row.status, isDemo: row.is_demo, includesUnverified: row.includes_unverified, payloadSha256: row.payload_sha256 }
    : null;
}

/** The immutable payload of a published or review snapshot, validated against the bundle contract. */
export async function loadSnapshotPayload(q: Q, snapshotId: string): Promise<KnowledgeBundle> {
  if (!UUID_RE.test(snapshotId)) throw new SnapshotNotReadableError(snapshotId, "not_found");
  const r = await q.query<{ status: string; kind: string; payload: unknown }>("SELECT status, kind, payload FROM content_snapshots WHERE id = $1", [snapshotId]);
  const row = r.rows[0];
  if (!row) throw new SnapshotNotReadableError(snapshotId, "not_found");
  if (row.status !== "published" && row.kind !== "review") throw new SnapshotNotReadableError(snapshotId, "draft_release");
  const parsed = knowledgeBundleSchema.safeParse(row.payload);
  if (!parsed.success) throw new SnapshotNotReadableError(snapshotId, "invalid_payload");
  return parsed.data;
}
