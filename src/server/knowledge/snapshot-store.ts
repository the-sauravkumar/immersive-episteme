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
