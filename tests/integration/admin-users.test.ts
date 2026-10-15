/**
 * Integration: admin services (src/server/admin) against a throwaway database (schema-harness).
 * Non-admin roles are refused; account creation, role grants, locking and the last-admin and
 * self-protection rules; every mutation leaves an audit_log row.
 */
import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@db/schema";
import type { StaffRole } from "@/lib/permissions/roles";
import { auditEntities, parseAuditFilter, queryAuditLog } from "@/server/admin/audit-log";
import { getHealthReport } from "@/server/admin/health";
import { effectiveSettings } from "@/server/admin/settings";
import {
  createStaffUser,
  grantStaffRole,
  listStaffUsers,
  lockStaffUser,
  revokeStaffRole,
  roleHolderCounts,
  unlockStaffUser,
} from "@/server/admin/users";
import { createAuth, type Auth } from "@/server/auth/config";
import { CmsError, type Actor } from "@/server/cms/core";

import { TEST_URL, createTestDatabase, createUser, one, type TestDb } from "./schema-harness";

const NON_ADMIN: StaffRole[] = ["curator", "content_editor", "researcher", "principal_investigator", "research_analyst", "study_facilitator"];

async function expectCode(p: Promise<unknown> | (() => unknown), code: string) {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (err) {
    expect(err).toBeInstanceOf(CmsError);
    expect((err as CmsError).code).toBe(code);
    return;
  }
  throw new Error(`expected CmsError ${code}`);
}

describe.skipIf(!TEST_URL)("admin services", () => {
  let t: TestDb;
  let auth: Auth;
  let admin: Actor;

  const grant = (userId: string, role: StaffRole) => t.pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [userId, role]);
  const deps = () => ({ pool: t.pool, auth, db: drizzle(t.pool, { schema, casing: "snake_case" }) });
  const auditCount = async (action: string, entityId: string) =>
    (await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM audit_log WHERE action = $1 AND entity_id = $2 AND actor_kind = 'user'", [action, entityId])).n;

  beforeAll(async () => {
    t = await createTestDatabase("admin");
    auth = createAuth({
      db: drizzle(t.pool, { schema, casing: "snake_case" }),
      secret: "x".repeat(40) + "abcdefghijklmnop",
      baseURL: "http://localhost:3000",
      rateLimit: false,
      accountThrottle: false,
    });
    const id = await createUser(t.pool, "admin_one");
    await grant(id, "platform_admin");
    admin = { userId: id, roles: ["platform_admin"] };
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("refuses every admin service to non-admin roles", async () => {
    for (const role of NON_ADMIN) {
      const actor: Actor = { userId: `x_${role}`, roles: [role] };
      await expectCode(listStaffUsers(t.pool, actor), "forbidden");
      await expectCode(createStaffUser(deps(), actor, { name: "N", email: `n-${role}@example.test`, password: "a-long-password-1", role: "curator" }), "forbidden");
      await expectCode(lockStaffUser(t.pool, actor, { userId: admin.userId, reason: "nope" }), "forbidden");
      await expectCode(unlockStaffUser(t.pool, actor, { userId: admin.userId }), "forbidden");
      await expectCode(grantStaffRole(t.pool, actor, { userId: admin.userId, role: "curator" }), "forbidden");
      await expectCode(revokeStaffRole(t.pool, actor, { userId: admin.userId, role: "platform_admin" }), "forbidden");
      await expectCode(roleHolderCounts(t.pool, actor), "forbidden");
      await expectCode(() => effectiveSettings(actor, {}), "forbidden");
      if (role !== "principal_investigator") {
        // The principal investigator holds admin.audit (matrix.ts), which also opens the /admin
        // overview; nobody else outside platform_admin holds an admin permission.
        await expectCode(getHealthReport(t.pool, actor), "forbidden");
        await expectCode(queryAuditLog(t.pool, actor, parseAuditFilter({})), "forbidden");
        await expectCode(auditEntities(t.pool, actor), "forbidden");
      }
    }
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM users");
    expect(n.n).toBe(1);
  });

  it("creates a staff account with a role, audited without the password", async () => {
    const { userId } = await createStaffUser(deps(), admin, { name: "Cura Tor", email: "Curator@Example.test", password: "a-long-password-1", role: "curator" });
    const roles = await t.pool.query("SELECT role, granted_by FROM user_roles WHERE user_id = $1", [userId]);
    expect(roles.rows).toEqual([{ role: "curator", granted_by: admin.userId }]);
    expect(await auditCount("admin.user_created", userId)).toBe(1);
    const row = await one<{ after: unknown }>(t.pool, "SELECT after FROM audit_log WHERE action = 'admin.user_created' AND entity_id = $1", [userId]);
    expect(JSON.stringify(row.after)).not.toContain("a-long-password-1");
    expect(JSON.stringify(row.after)).toContain("curator@example.test");
    // The same email again is refused rather than silently granting a role.
    await expectCode(createStaffUser(deps(), admin, { name: "Again", email: "curator@example.test", password: "a-long-password-2", role: "researcher" }), "email_taken");

    await grantStaffRole(t.pool, admin, { userId, role: "researcher" });
    expect(await auditCount("admin.role_granted", userId)).toBe(1);
    await expectCode(grantStaffRole(t.pool, admin, { userId, role: "researcher" }), "already_granted");
    await revokeStaffRole(t.pool, admin, { userId, role: "researcher" });
    expect(await auditCount("admin.role_revoked", userId)).toBe(1);

    const list = await listStaffUsers(t.pool, admin);
    expect(list.find((u) => u.id === userId)?.roles).toEqual(["curator"]);
  });

  it("keeps the last active platform admin and refuses self-removal", async () => {
    await expectCode(revokeStaffRole(t.pool, admin, { userId: admin.userId, role: "platform_admin" }), "self_revoke");
    // A second admin cannot remove the only other (last remaining after a lock) admin role.
    const second = await createUser(t.pool, "admin_two");
    await grant(second, "platform_admin");
    const secondActor: Actor = { userId: second, roles: ["platform_admin"] };
    await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = $1", [second]);
    // admin_two is locked, so admin_one is the last active holder.
    const thirdActor: Actor = { userId: "admin_three_virtual", roles: ["platform_admin"] };
    await expectCode(revokeStaffRole(t.pool, thirdActor, { userId: admin.userId, role: "platform_admin" }), "last_admin");
    await expectCode(lockStaffUser(t.pool, secondActor, { userId: admin.userId, reason: "testing last admin" }), "last_admin");
    const counts = await roleHolderCounts(t.pool, admin);
    expect(counts.platform_admin).toBe(1);
  });

  it("refuses self-lock; locking ends sessions and unlocking restores", async () => {
    await expectCode(lockStaffUser(t.pool, admin, { userId: admin.userId, reason: "myself" }), "self_lock");
    const target = await createUser(t.pool, "lock_target");
    await grant(target, "content_editor");
    await t.pool.query(
      "INSERT INTO auth_sessions (id, token, user_id, expires_at) VALUES ('s1', 'tok-1', $1, now() + interval '1 hour'), ('s2', 'tok-2', $1, now() + interval '1 hour')",
      [target],
    );
    const res = await lockStaffUser(t.pool, admin, { userId: target, reason: "left the project" });
    expect(res.sessionsEnded).toBe(2);
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [target])).n).toBe(0);
    expect((await one<{ d: Date | null }>(t.pool, "SELECT disabled_at AS d FROM users WHERE id = $1", [target])).d).not.toBeNull();
    const lockAudit = await one<{ reason: string }>(t.pool, "SELECT reason FROM audit_log WHERE action = 'admin.user_locked' AND entity_id = $1", [target]);
    expect(lockAudit.reason).toBe("left the project");
    await expectCode(lockStaffUser(t.pool, admin, { userId: target, reason: "again" }), "already_locked");
    await unlockStaffUser(t.pool, admin, { userId: target });
    expect(await auditCount("admin.user_unlocked", target)).toBe(1);
  });

  it("reads the audit log with filters and pagination", async () => {
    const all = await queryAuditLog(t.pool, admin, parseAuditFilter({}));
    expect(all.rows.length).toBeGreaterThan(0);
    expect(all.rows[0]!.actorName).toBeTruthy();
    const roles = await queryAuditLog(t.pool, admin, parseAuditFilter({ action: "admin.role" }));
    expect(roles.rows.every((r) => r.action.startsWith("admin.role"))).toBe(true);
    const literal = await queryAuditLog(t.pool, admin, parseAuditFilter({ action: "admin_" }));
    expect(literal.rows).toHaveLength(0); // "_" is matched literally, not as a wildcard
    const reason = await queryAuditLog(t.pool, admin, parseAuditFilter({ q: "left the" }));
    expect(reason.rows.map((r) => r.action)).toContain("admin.user_locked");
    const bad = parseAuditFilter({ page: "-3", from: "yesterday" });
    expect(bad.page).toBe(1);
    expect(bad.from).toBeUndefined();
    // audit_log is append-only.
    await expect(t.pool.query("UPDATE audit_log SET reason = 'x'")).rejects.toThrow(/append-only/);
  });

  it("reports health from the database and the migration journal", async () => {
    const h = await getHealthReport(t.pool, admin, { journalPath: join(process.cwd(), "db", "migrations", "meta", "_journal.json"), env: {} });
    expect(h.database.ok).toBe(true);
    expect(h.migrations.ok && h.migrations.value.applied === h.migrations.value.expected).toBe(true);
    expect(h.telemetry.ok && h.telemetry.value.batchesTotal).toBe(0);
    expect(h.quarantine.ok && h.quarantine.value.unresolved).toBe(0);
    expect(h.storage.ok && h.storage.value.config.mode).toBe("local");
    const s3 = effectiveSettings(admin, { MEDIA_S3_BUCKET: "bucket-a", APP_BUILD_VERSION: "b1" });
    expect(JSON.stringify(s3)).toContain("bucket-a");
    expect(JSON.stringify(s3)).not.toMatch(/SECRET|password=/i);
  });
});
