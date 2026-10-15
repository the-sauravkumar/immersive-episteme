/**
 * CMS / admin service core: the acting staff member, permission checks, transactions that carry
 * the actor into the database triggers, the append-only audit log and error mapping.
 *
 * Every CMS and admin mutation runs as:
 *   server action -> assertPermission (src/server/auth/staff.ts) -> Zod parse -> service(pool, actor, input)
 * and the service re-checks the permission with `ensure()` (defence in depth; it is also what the
 * integration tests exercise), runs in `inActorTx` and appends an `audit_log` row in the SAME
 * transaction, so a mutation and its audit entry commit or roll back together.
 *
 * Not `server-only`: integration tests call the services with their own pool.
 */
import type { Pool, PoolClient } from "pg";

import { canAny } from "@/lib/permissions/can";
import type { Permission } from "@/lib/permissions/permissions";
import type { StaffRole } from "@/lib/permissions/roles";

export type Q = Pick<PoolClient, "query">;

/** The acting staff member. `StaffPrincipal` (src/server/auth/staff.ts) satisfies it. */
export interface Actor {
  readonly userId: string;
  readonly roles: readonly StaffRole[];
}

/** A refused CMS operation. `code` is stable (tests and UI key on it); `message` is for people. */
export class CmsError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 422 = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CmsError";
  }
}

/** Throws `forbidden` unless the actor holds (any of) the permission(s). */
export function ensure(actor: Actor, permission: Permission | readonly Permission[]): void {
  const anyOf: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!canAny(actor, anyOf)) {
    throw new CmsError("forbidden", `Your roles do not allow this (${anyOf.join(" or ")} required).`, 403);
  }
}

/**
 * Runs `fn` in a transaction with `app.actor_id` and `app.change_reason` set, so the
 * verification-record trigger (migration 0003/0005) records who changed a review state and why.
 */
export async function inActorTx<T>(pool: Pool, actor: Actor, reason: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.change_reason', $2, true)", [actor.userId, reason ?? ""]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw mapDbError(err);
  } finally {
    client.release();
  }
}

/** Sets the change reason for the rest of the transaction (verification records read it). */
export async function setChangeReason(q: Q, reason: string | null): Promise<void> {
  await q.query("SELECT set_config('app.change_reason', $1, true)", [reason ?? ""]);
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Appends one audit_log row for a staff action (audit_log is append-only, migration 0003). */
export async function audit(q: Q, actor: Actor, e: AuditEntry): Promise<string> {
  const r = await q.query<{ id: string }>(
    `INSERT INTO audit_log (actor_kind, actor_id, action, entity, entity_id, before, after, reason)
     VALUES ('user', $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) RETURNING id`,
    [
      actor.userId,
      e.action,
      e.entity,
      e.entityId ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      e.reason ?? null,
    ],
  );
  return r.rows[0]!.id;
}

interface PgError {
  code?: string;
  message?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Database refusals become CmsErrors: integrity triggers raise SQLSTATE 23514 with an "ie: "
 * message (migration 0003), constraints raise 23514/23505/23503.
 */
export function mapDbError(err: unknown): unknown {
  if (err instanceof CmsError) return err;
  const e = err as PgError;
  if (!e || typeof e !== "object" || typeof e.code !== "string") return err;
  const msg = e.message ?? "";
  if (e.code === "23514" && msg.startsWith("ie: ")) return new CmsError("db_rule", msg.slice(4), 422);
  if (e.code === "23514") return new CmsError("db_check", `Rejected by the database rule ${e.constraint ?? ""}`.trim(), 422);
  if (e.code === "23505") return new CmsError("duplicate", `Already exists (${e.constraint ?? "unique constraint"})`, 409);
  if (e.code === "23503") return new CmsError("reference", `Referenced record is missing or still in use (${e.constraint ?? "foreign key"})`, 409);
  if (e.code === "22P02") return new CmsError("invalid_input", "Malformed identifier or value", 400);
  return err;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
