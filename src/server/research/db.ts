/**
 * Shared database helpers for the research console services. Services take a `Q` (pool or
 * client) so they run unchanged in Server Actions (getPool()) and in integration tests
 * (tests/integration/schema-harness.ts). Not `server-only` for that reason; nothing here is
 * importable from client code because it needs a database handle.
 */
import type { Pool, PoolClient } from "pg";

export type Q = Pick<Pool | PoolClient, "query">;

/** Runs `fn` in a transaction on a dedicated client (or reuses a client already in one). */
export async function inTransaction<T>(pool: Pool | PoolClient, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  if (!("connect" in pool) || typeof (pool as Pool).totalCount !== "number") return fn(pool as PoolClient);
  const client = await (pool as Pool).connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** True for a pg Pool, false for a single client (the same test `inTransaction` uses). */
function isPool(q: Q): boolean {
  return "connect" in q && typeof (q as Pool).totalCount === "number";
}

/**
 * Runs independent queries: concurrently on a pool (each takes its own connection), one after
 * another on a single client. pg queues concurrent queries on one client but deprecates it
 * ("removed in pg@9.0"), and a client inside a transaction must not be shared anyway.
 */
export async function queryAll<const T extends readonly (() => unknown)[]>(
  q: Q,
  fns: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  type Out = { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
  if (isPool(q)) return (await Promise.all(fns.map((f) => f()))) as Out;
  const out: unknown[] = [];
  for (const f of fns) out.push(await f());
  return out as Out;
}

export interface Actor {
  userId: string;
}

/** Appends an audit_log row (append-only by trigger). */
export async function audit(
  q: Q,
  actor: Actor | null,
  action: string,
  entity: string,
  entityId: string | null,
  change: { before?: unknown; after?: unknown; reason?: string | null } = {},
): Promise<void> {
  await q.query(
    `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, before, after, reason)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
    [
      actor ? "user" : "system",
      actor?.userId ?? null,
      action,
      entity,
      entityId,
      change.before === undefined ? null : JSON.stringify(change.before),
      change.after === undefined ? null : JSON.stringify(change.after),
      change.reason ?? null,
    ],
  );
}

/** A refusal the console shows to the user verbatim (validation or a guarded transition). */
export class ResearchActionError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
    this.name = "ResearchActionError";
  }
}

/** Postgres raises from ie_raise() arrive as errors with a readable message; surface it. */
export function dbMessage(err: unknown): string {
  if (err instanceof ResearchActionError) return err.message;
  const e = err as { message?: string; code?: string };
  return e?.message ? e.message.replace(/^error:\s*/i, "") : "Unexpected database error";
}
