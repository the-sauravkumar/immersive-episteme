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

/** The newest real (non-demo) review snapshot, or null. Used by the demo and staff preview. */
export async function latestReviewSnapshotId(q: Q): Promise<string | null> {
  const r = await q.query<{ id: string }>(
    "SELECT id FROM content_snapshots WHERE kind = 'review' AND NOT is_demo ORDER BY created_at DESC, id DESC LIMIT 1",
  );
  return r.rows[0]?.id ?? null;
}

export interface SearchOptions {
  /** Maximum hits (1..50, default 20). */
  limit?: number;
  /** Restrict to one tradition's concepts (by tradition id). */
  traditionId?: string;
}

export interface SearchHitRow {
  conceptId: string;
  key: string;
  /** Combined score: 2 x full-text rank + best trigram similarity (title or local term). */
  score: number;
  fullText: number;
  trigram: number;
}

export const MAX_QUERY_LENGTH = 200;

/**
 * Searches the concepts of one snapshot payload (not the live tables, so results always match
 * what the snapshot shows). Full text: `websearch_to_tsquery('simple', q)` against the same
 * weighted vector as `concepts.search` (ie_concept_search_vector: title and local terms A,
 * summary B, body C). Trigram: `similarity` / `word_similarity` of the query to the title and
 * each local term, so partial and misspelt craft terms still match.
 */
export async function searchSnapshotConcepts(q: Q, snapshotId: string, query: string, opts: SearchOptions = {}): Promise<SearchHitRow[]> {
  const text = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (text.length < 2 || !UUID_RE.test(snapshotId)) return [];
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const r = await q.query<{ concept_id: string; key: string; fts: number; trgm: number }>(
    `WITH c AS (
       SELECT e->>'id' AS concept_id, e->>'key' AS key, e->>'title' AS title, e->>'summary' AS summary, e->>'bodyMd' AS body_md,
              e->>'traditionId' AS tradition_id,
              ARRAY(SELECT jsonb_array_elements_text(coalesce(e->'localTerms', '[]'::jsonb))) AS local_terms
         FROM content_snapshots s, jsonb_array_elements(s.payload->'concepts') e
        WHERE s.id = $1 AND (s.status = 'published' OR s.kind = 'review')
     ), q AS (SELECT websearch_to_tsquery('simple', $2) AS tsq, lower($2) AS raw),
     scored AS (
       SELECT c.concept_id, c.key, c.tradition_id,
              ts_rank_cd(ie_concept_search_vector(c.title, c.summary, c.local_terms, c.body_md), q.tsq) AS fts,
              ie_concept_search_vector(c.title, c.summary, c.local_terms, c.body_md) @@ q.tsq AS matched,
              greatest(
                similarity(lower(c.title), q.raw),
                word_similarity(q.raw, lower(c.title)),
                coalesce((SELECT max(greatest(similarity(lower(t), q.raw), word_similarity(q.raw, lower(t)))) FROM unnest(c.local_terms) t), 0)
              ) AS trgm
         FROM c, q
     )
     SELECT concept_id, key, fts::float8 AS fts, trgm::float8 AS trgm
       FROM scored
      WHERE (matched OR trgm >= 0.45) AND ($3::text IS NULL OR tradition_id = $3::text)
      ORDER BY (2 * fts + trgm) DESC, key
      LIMIT $4`,
    [snapshotId, text, opts.traditionId ?? null, limit],
  );
  return r.rows.map((x) => ({ conceptId: x.concept_id, key: x.key, fullText: x.fts, trigram: x.trgm, score: 2 * x.fts + x.trgm }));
}
