/**
 * Shared plumbing for the assessment services: the query handle type, typed service errors,
 * transactions and audit entries. Not `server-only` so the integration tests can run the
 * services against throwaway databases; application code reaches them through the server
 * actions in ./actions.
 */
import type { Pool, PoolClient } from "pg";

export type Q = Pick<Pool | PoolClient, "query">;

export type AssessmentErrorCode = "not_found" | "forbidden" | "conflict" | "invalid" | "immutable";

export class AssessmentError extends Error {
  constructor(
    readonly code: AssessmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AssessmentError";
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: string, what: string): void {
  if (!UUID_RE.test(value)) throw new AssessmentError("not_found", `${what} not found`);
}

/** Runs `fn` in one transaction on a dedicated client (a client passed in is used as is: its caller owns the transaction). */
export async function inTransaction<T>(pool: Pool | PoolClient, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (typeof (pool as Pool).totalCount !== "number") return fn(pool as PoolClient);
  const client = await (pool as Pool).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Database trigger refusals ("ie: ..." messages) mapped to a service error. */
export function mapDbError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/immutable|locked/i.test(msg)) throw new AssessmentError("immutable", msg.replace(/^ie: /, ""));
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
    throw new AssessmentError("conflict", "This record already exists.");
  }
  throw err;
}

export async function audit(
  q: Q,
  entry: { actorId: string; action: string; entity: string; entityId: string; after?: unknown; reason?: string },
): Promise<void> {
  await q.query(
    "INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, after, reason) VALUES ('user', $1, $2, $3, $4, $5, $6)",
    [entry.actorId, entry.action, entry.entity, entry.entityId, entry.after === undefined ? null : JSON.stringify(entry.after), entry.reason ?? null],
  );
}
