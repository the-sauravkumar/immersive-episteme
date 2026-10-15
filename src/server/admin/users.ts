/**
 * Staff account administration: list, create, lock/unlock, grant/revoke roles.
 *
 * Rules (foundation.md §1-2):
 *  - accounts are never hard-deleted (40 actor FKs keep provenance); an administrator locks one
 *    with `users.disabled_at`, and locking also ends the user's live sessions;
 *  - an administrator cannot lock themselves, nor remove their own platform_admin role;
 *  - the last active (non-locked) platform_admin role holder can never lose the role, so the
 *    platform always keeps an operator;
 *  - creating an existing email is refused (the bootstrap helper is idempotent and would
 *    otherwise silently grant a role to an existing account);
 *  - every mutation writes one audit_log row (never a password).
 *
 * Not `server-only`: integration tests call these with their own pool and auth instance.
 */
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { STAFF_ROLES, type StaffRole } from "@/lib/permissions/roles";
import { createStaffAccount } from "@/server/auth/bootstrap";
import type { Auth } from "@/server/auth/config";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/config";
import { grantRole, revokeRole } from "@/server/auth/roles-repository";
import { CmsError, audit, ensure, inActorTx, type Actor, type Q } from "@/server/cms/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

export interface StaffUserRow {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  roles: StaffRole[];
  activeSessions: number;
}

export async function listStaffUsers(pool: Pool, actor: Actor): Promise<StaffUserRow[]> {
  ensure(actor, ["admin.users", "admin.roles"]);
  const r = await pool.query<{ id: string; name: string; email: string; created_at: Date; disabled_at: Date | null; roles: StaffRole[] | null; sessions: number }>(
    `SELECT u.id, u.name, u.email, u.created_at, u.disabled_at,
            array_agg(ur.role::text ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL) AS roles,
            (SELECT count(*)::int FROM auth_sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS sessions
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
      GROUP BY u.id ORDER BY lower(u.name), u.email`,
  );
  return r.rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    createdAt: u.created_at.toISOString(),
    disabledAt: u.disabled_at ? u.disabled_at.toISOString() : null,
    roles: u.roles ?? [],
    activeSessions: u.sessions,
  }));
}

export const createStaffInput = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z.email("Enter a valid email address").transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(256),
  role: z.enum(STAFF_ROLES, "Choose a role"),
});
export type CreateStaffInput = z.input<typeof createStaffInput>;

export async function createStaffUser(
  deps: { pool: Pool; auth: Auth; db: AnyPgDatabase },
  actor: Actor,
  raw: CreateStaffInput,
): Promise<{ userId: string }> {
  ensure(actor, "admin.users");
  // Granting the initial role is a role assignment too.
  ensure(actor, "admin.roles");
  const input = createStaffInput.parse(raw);
  const exists = await deps.pool.query("SELECT 1 FROM users WHERE email = $1", [input.email]);
  if (exists.rowCount) throw new CmsError("email_taken", "A staff account with this email already exists. Assign roles to it instead.", 409);
  // Better Auth's internal adapter writes the user + credential with its own scrypt hasher;
  // it uses its own connection, so the audit row follows immediately after.
  const res = await createStaffAccount(deps.auth, deps.db, input, actor.userId);
  await inActorTx(deps.pool, actor, null, (c) =>
    audit(c, actor, {
      action: "admin.user_created",
      entity: "users",
      entityId: res.userId,
      after: { name: input.name, email: input.email, roles: res.roles },
      reason: "staff account created by an administrator",
    }),
  );
  return { userId: res.userId };
}

export const userIdInput = z.object({ userId: z.string().trim().min(1).max(128) });
export const lockInput = userIdInput.extend({ reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500) });

async function loadUser(q: Q, userId: string): Promise<{ id: string; email: string; disabled_at: Date | null }> {
  const r = await q.query<{ id: string; email: string; disabled_at: Date | null }>("SELECT id, email, disabled_at FROM users WHERE id = $1 FOR UPDATE", [userId]);
  const u = r.rows[0];
  if (!u) throw new CmsError("not_found", "No such staff account.", 404);
  return u;
}

async function activeAdminCount(q: Q, excludingUserId?: string): Promise<number> {
  const r = await q.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
      WHERE ur.role = 'platform_admin' AND u.disabled_at IS NULL AND ($1::text IS NULL OR u.id <> $1)`,
    [excludingUserId ?? null],
  );
  return r.rows[0]!.n;
}

export async function lockStaffUser(pool: Pool, actor: Actor, raw: z.input<typeof lockInput>): Promise<{ sessionsEnded: number }> {
  ensure(actor, "admin.users");
  const input = lockInput.parse(raw);
  if (input.userId === actor.userId) throw new CmsError("self_lock", "You cannot lock your own account.", 409);
  return inActorTx(pool, actor, input.reason, async (c) => {
    const u = await loadUser(c, input.userId);
    if (u.disabled_at) throw new CmsError("already_locked", "This account is already locked.", 409);
    const isAdmin = await c.query("SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'platform_admin'", [u.id]);
    if (isAdmin.rowCount && (await activeAdminCount(c, u.id)) === 0) {
      throw new CmsError("last_admin", "This is the last active platform administrator; it cannot be locked.", 409);
    }
    await c.query("UPDATE users SET disabled_at = now() WHERE id = $1", [u.id]);
    const ended = await c.query("DELETE FROM auth_sessions WHERE user_id = $1", [u.id]);
    await audit(c, actor, {
      action: "admin.user_locked",
      entity: "users",
      entityId: u.id,
      before: { disabledAt: null },
      after: { disabled: true, sessionsEnded: ended.rowCount ?? 0 },
      reason: input.reason,
    });
    return { sessionsEnded: ended.rowCount ?? 0 };
  });
}

export async function unlockStaffUser(pool: Pool, actor: Actor, raw: z.input<typeof userIdInput>): Promise<void> {
  ensure(actor, "admin.users");
  const input = userIdInput.parse(raw);
  await inActorTx(pool, actor, null, async (c) => {
    const u = await loadUser(c, input.userId);
    if (!u.disabled_at) throw new CmsError("not_locked", "This account is not locked.", 409);
    await c.query("UPDATE users SET disabled_at = NULL WHERE id = $1", [u.id]);
    await audit(c, actor, {
      action: "admin.user_unlocked",
      entity: "users",
      entityId: u.id,
      before: { disabledAt: u.disabled_at.toISOString() },
      after: { disabled: false },
    });
  });
}

export const roleInput = userIdInput.extend({ role: z.enum(STAFF_ROLES, "Choose a role") });

export async function grantStaffRole(pool: Pool, actor: Actor, raw: z.input<typeof roleInput>): Promise<{ granted: boolean }> {
  ensure(actor, "admin.roles");
  const input = roleInput.parse(raw);
  return inActorTx(pool, actor, null, async (c) => {
    await loadUser(c, input.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- grantRole only needs `insert`
    const granted = await grantRole(drizzleOn(c) as any, input.userId, input.role, actor.userId);
    if (!granted) throw new CmsError("already_granted", "The account already holds this role.", 409);
    await audit(c, actor, { action: "admin.role_granted", entity: "user_roles", entityId: input.userId, after: { role: input.role } });
    return { granted };
  });
}

export async function revokeStaffRole(pool: Pool, actor: Actor, raw: z.input<typeof roleInput>): Promise<{ revoked: boolean }> {
  ensure(actor, "admin.roles");
  const input = roleInput.parse(raw);
  if (input.role === "platform_admin" && input.userId === actor.userId) {
    throw new CmsError("self_revoke", "You cannot remove your own administrator role.", 409);
  }
  return inActorTx(pool, actor, null, async (c) => {
    await loadUser(c, input.userId);
    if (input.role === "platform_admin") {
      // Serialise concurrent revocations so two admins cannot remove each other at once.
      await c.query("SELECT pg_advisory_xact_lock(hashtext('admin.platform_admin_holders'))");
      if ((await activeAdminCount(c, input.userId)) === 0) {
        throw new CmsError("last_admin", "This is the last active platform administrator; the role cannot be removed.", 409);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- revokeRole only needs `delete`
    const revoked = await revokeRole(drizzleOn(c) as any, input.userId, input.role);
    if (!revoked) throw new CmsError("not_granted", "The account does not hold this role.", 409);
    await audit(c, actor, { action: "admin.role_revoked", entity: "user_roles", entityId: input.userId, before: { role: input.role } });
    return { revoked };
  });
}

/** Drizzle over the transaction's client, so role writes join the audited transaction. */
function drizzleOn(c: PoolClient) {
  return drizzle(c, { casing: "snake_case" });
}

/** Holders per staff role (non-locked accounts). */
export async function roleHolderCounts(pool: Pool, actor: Actor): Promise<Record<StaffRole, number>> {
  ensure(actor, ["admin.roles", "admin.users"]);
  const r = await pool.query<{ role: StaffRole; n: number }>(
    `SELECT ur.role::text AS role, count(*)::int AS n FROM user_roles ur JOIN users u ON u.id = ur.user_id
      WHERE u.disabled_at IS NULL GROUP BY ur.role`,
  );
  const out = Object.fromEntries(STAFF_ROLES.map((x) => [x, 0])) as Record<StaffRole, number>;
  for (const row of r.rows) out[row.role] = row.n;
  return out;
}
