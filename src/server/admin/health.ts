/**
 * Platform health for /admin: database, migrations, telemetry ingest, quarantine, storage.
 * Read-only; every figure comes from a query or a file, nothing is estimated.
 *
 * Not `server-only` (tests call it with their own pool).
 */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join } from "node:path";

import type { Pool } from "pg";

import { ensure, type Actor } from "@/server/cms/core";

export const ADMIN_ANY = ["admin.users", "admin.roles", "admin.settings", "admin.audit"] as const;

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

export interface MediaStorageConfig {
  mode: "s3" | "local";
  bucket: string | null;
  endpoint: string | null;
  localDir: string;
}

/** Media storage mode, from the same variables the media library reads (MEDIA_S3_*, MEDIA_LOCAL_DIR). */
export function mediaStorageConfig(env: Record<string, string | undefined> = process.env): MediaStorageConfig {
  const bucket = env.MEDIA_S3_BUCKET?.trim() || null;
  return {
    mode: bucket ? "s3" : "local",
    bucket,
    endpoint: env.MEDIA_S3_ENDPOINT?.trim() || null,
    localDir: env.MEDIA_LOCAL_DIR?.trim() || ".data/media",
  };
}

export interface HealthReport {
  checkedAt: string;
  database: Check<{ serverVersion: string; latencyMs: number }>;
  migrations: Check<{ applied: number; expected: number; pendingTags: string[] }>;
  telemetry: Check<{
    batchesTotal: number;
    lastReceivedAt: string | null;
    lastReceivedAgeSeconds: number | null;
    batches24h: number;
    lagP50Ms: number | null;
    lagP95Ms: number | null;
    openSequenceGaps: number;
  }>;
  quarantine: Check<{ unresolved: number; byReason: { reason: string; n: number }[] }>;
  storage: Check<{ config: MediaStorageConfig; localDirWritable: boolean | null; assets: number; totalBytes: number }>;
}

async function check<T>(fn: () => Promise<T>): Promise<Check<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getHealthReport(
  pool: Pool,
  actor: Actor,
  opts: { journalPath?: string; cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<HealthReport> {
  ensure(actor, ADMIN_ANY);
  const cwd = opts.cwd ?? process.cwd();
  const journalPath = opts.journalPath ?? join(cwd, "db", "migrations", "meta", "_journal.json");

  const database = await check(async () => {
    const t0 = performance.now();
    const r = await pool.query<{ v: string }>("SELECT current_setting('server_version') AS v");
    return { serverVersion: r.rows[0]!.v, latencyMs: Math.round(performance.now() - t0) };
  });

  const migrations = await check(async () => {
    // The path is chosen at run time; next.config.ts outputFileTracingIncludes ships the journal.
    const journal = JSON.parse(await readFile(/*turbopackIgnore: true*/ journalPath, "utf8")) as { entries: { tag: string }[] };
    const r = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
    const applied = r.rows[0]!.n;
    return { applied, expected: journal.entries.length, pendingTags: journal.entries.slice(applied).map((e) => e.tag) };
  });

  const telemetry = await check(async () => {
    const r = await pool.query<{ total: number; last: Date | null; age: number | null; n24: number; p50: number | null; p95: number | null; gaps: number }>(
      `SELECT (SELECT count(*)::int FROM telemetry_batches) AS total,
              (SELECT max(received_at) FROM telemetry_batches) AS last,
              (SELECT extract(epoch FROM now() - max(received_at))::float8 FROM telemetry_batches) AS age,
              (SELECT count(*)::int FROM telemetry_batches WHERE received_at > now() - interval '24 hours') AS n24,
              (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM received_at - client_sent_at) * 1000)
                 FROM telemetry_batches WHERE received_at > now() - interval '24 hours' AND client_sent_at IS NOT NULL) AS p50,
              (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM received_at - client_sent_at) * 1000)
                 FROM telemetry_batches WHERE received_at > now() - interval '24 hours' AND client_sent_at IS NOT NULL) AS p95,
              (SELECT count(*)::int FROM sequence_gaps WHERE resolved_at IS NULL AND kind = 'gap') AS gaps`,
    );
    const x = r.rows[0]!;
    return {
      batchesTotal: x.total,
      lastReceivedAt: x.last ? x.last.toISOString() : null,
      lastReceivedAgeSeconds: x.age === null ? null : Math.round(x.age),
      batches24h: x.n24,
      lagP50Ms: x.p50 === null ? null : Math.round(x.p50),
      lagP95Ms: x.p95 === null ? null : Math.round(x.p95),
      openSequenceGaps: x.gaps,
    };
  });

  const quarantine = await check(async () => {
    const r = await pool.query<{ reason: string; n: number }>(
      `SELECT split_part(reason, ':', 1) AS reason, count(*)::int AS n FROM telemetry_quarantine
        WHERE resolved_at IS NULL GROUP BY 1 ORDER BY 2 DESC, 1`,
    );
    return { unresolved: r.rows.reduce((s, x) => s + x.n, 0), byReason: r.rows };
  });

  const storage = await check(async () => {
    const config = mediaStorageConfig(opts.env ?? process.env);
    let localDirWritable: boolean | null = null;
    if (config.mode === "local") {
      // A runtime data directory, never part of the build output.
      const dir = isAbsolute(config.localDir) ? config.localDir : join(/*turbopackIgnore: true*/ cwd, config.localDir);
      localDirWritable = await access(dir, constants.W_OK).then(
        () => true,
        () => false,
      );
    }
    const r = await pool.query<{ n: number; bytes: string | null }>("SELECT count(*)::int AS n, sum(byte_size)::text AS bytes FROM assets");
    return { config, localDirWritable, assets: r.rows[0]!.n, totalBytes: Number(r.rows[0]!.bytes ?? 0) };
  });

  return { checkedAt: new Date().toISOString(), database, migrations, telemetry, quarantine, storage };
}
