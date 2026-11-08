import { join } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@db/schema";
import type { StaffGrant, StaffRole } from "@/lib/permissions/roles";
import { auditEntities, parseAuditFilter, queryAuditLog } from "@/server/admin/audit-log";
import { getHealthReport } from "@/server/admin/health";
import { effectiveSettings } from "@/server/admin/settings";
import {
  clearStaffSignInLock,
  createStaffUser,
  listStaffUsers,
  lockStaffUser,
  resetStaffPassword,
  revokeStaffRole,
  roleHolderCounts,
  setStaffRole,
  unlockStaffUser,
} from "@/server/admin/users";
import { consumeSignInAttempt } from "@/server/auth/account-throttle";
import { createInvite, revokeInvite } from "@/server/access/invites";
import { grantRoleToExistingAccount, LastSuperAdminError } from "@/server/auth/bootstrap";
import { createAuth, type Auth } from "@/server/auth/config";
import { grantListedSuperAdmin } from "@/server/auth/super-admin";
import { CmsError, type Actor } from "@/server/cms/core";

import { TEST_URL, createTestDatabase, createUser, one, type TestDb } from "./schema-harness";

const NON_ADMIN: StaffGrant[] = ["curator", "researcher", "principal_investigator"];

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
  let superAdmin: Actor;

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
    await grant(id, "super_admin");
    superAdmin = { userId: id, roles: ["super_admin"] };
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  it("refuses every admin service to non-admin roles", async () => {
    for (const role of NON_ADMIN) {
      const actor: Actor = { userId: `x_${role}`, roles: [role] };
      await expectCode(listStaffUsers(t.pool, actor), "forbidden");
      await expectCode(createStaffUser(deps(), actor, { name: "N", email: `n-${role}@example.test`, password: "a-long-password-1", role: "curator" }), "forbidden");
      await expectCode(lockStaffUser(t.pool, actor, { userId: superAdmin.userId, reason: "nope" }), "forbidden");
      await expectCode(unlockStaffUser(t.pool, actor, { userId: superAdmin.userId }), "forbidden");
      await expectCode(setStaffRole(t.pool, actor, { userId: superAdmin.userId, role: "curator" }), "forbidden");
      await expectCode(revokeStaffRole(t.pool, actor, { userId: superAdmin.userId }), "forbidden");
      await expectCode(roleHolderCounts(t.pool, actor), "forbidden");
      await expectCode(() => effectiveSettings(actor, {}), "forbidden");
      if (role !== "principal_investigator") {
        await expectCode(getHealthReport(t.pool, actor), "forbidden");
        await expectCode(queryAuditLog(t.pool, actor, parseAuditFilter({})), "forbidden");
        await expectCode(auditEntities(t.pool, actor), "forbidden");
      }
    }
    const n = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM users");
    expect(n.n).toBe(1);
  });

  it("creates a staff account with a role, audited without the password", async () => {
    const { userId } = await createStaffUser(deps(), superAdmin, { name: "Cura Tor", email: "Curator@Example.test", password: "a-long-password-1", role: "curator" });
    const roles = await t.pool.query("SELECT role, granted_by FROM user_roles WHERE user_id = $1", [userId]);
    expect(roles.rows).toEqual([{ role: "curator", granted_by: superAdmin.userId }]);
    expect(await auditCount("admin.user_created", userId)).toBe(1);
    const row = await one<{ after: unknown }>(t.pool, "SELECT after FROM audit_log WHERE action = 'admin.user_created' AND entity_id = $1", [userId]);
    expect(JSON.stringify(row.after)).not.toContain("a-long-password-1");
    expect(JSON.stringify(row.after)).toContain("curator@example.test");
    await expectCode(createStaffUser(deps(), superAdmin, { name: "Again", email: "curator@example.test", password: "a-long-password-2", role: "researcher" }), "email_taken");

    await setStaffRole(t.pool, superAdmin, { userId, role: "researcher" });
    expect(await auditCount("admin.role_set", userId)).toBe(1);
    await expectCode(setStaffRole(t.pool, superAdmin, { userId, role: "researcher" }), "already_granted");
    await setStaffRole(t.pool, superAdmin, { userId, role: "researcher", principalInvestigator: "on" });
    let listed = (await listStaffUsers(t.pool, superAdmin)).find((u) => u.id === userId);
    expect([listed?.role, listed?.principalInvestigator]).toEqual(["researcher", true]);
    await setStaffRole(t.pool, superAdmin, { userId, role: "curator", principalInvestigator: true });
    listed = (await listStaffUsers(t.pool, superAdmin)).find((u) => u.id === userId);
    expect([listed?.role, listed?.principalInvestigator]).toEqual(["curator", false]);
    expect((await t.pool.query("SELECT count(*)::int AS n FROM user_roles WHERE user_id = $1", [userId])).rows[0].n).toBe(1);
    await expect(t.pool.query("UPDATE user_roles SET principal_investigator = true WHERE user_id = $1", [userId])).rejects.toThrow(/user_roles_principal_investigator_ck/);
    await expect(t.pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'researcher')", [userId])).rejects.toThrow(/duplicate key/);
    await revokeStaffRole(t.pool, superAdmin, { userId });
    expect(await auditCount("admin.role_revoked", userId)).toBe(1);
    await expectCode(revokeStaffRole(t.pool, superAdmin, { userId }), "not_granted");
    expect((await listStaffUsers(t.pool, superAdmin)).find((u) => u.id === userId)?.role).toBeNull();
    await setStaffRole(t.pool, superAdmin, { userId, role: "curator" });
  });

  it("keeps the last active Super Admin and refuses self-removal", async () => {
    await expectCode(revokeStaffRole(t.pool, superAdmin, { userId: superAdmin.userId }), "self_revoke");
    await expectCode(setStaffRole(t.pool, superAdmin, { userId: superAdmin.userId, role: "researcher" }), "self_revoke");
    const second = await createUser(t.pool, "admin_two");
    await grant(second, "super_admin");
    const secondActor: Actor = { userId: second, roles: ["super_admin"] };
    await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = $1", [second]);
    const thirdActor: Actor = { userId: "admin_three_virtual", roles: ["super_admin"] };
    await expectCode(revokeStaffRole(t.pool, thirdActor, { userId: superAdmin.userId }), "last_super_admin");
    await expectCode(setStaffRole(t.pool, thirdActor, { userId: superAdmin.userId, role: "curator" }), "last_super_admin");
    const adminEmail = (await one<{ email: string }>(t.pool, "SELECT email FROM users WHERE id = $1", [superAdmin.userId])).email;
    await expect(grantRoleToExistingAccount(drizzle(t.pool, { schema, casing: "snake_case" }), adminEmail, { role: "curator", principalInvestigator: false })).rejects.toBeInstanceOf(LastSuperAdminError);
    await expectCode(lockStaffUser(t.pool, secondActor, { userId: superAdmin.userId, reason: "testing last admin" }), "last_super_admin");
    const counts = await roleHolderCounts(t.pool, superAdmin);
    expect(counts.super_admin).toBe(1);
  });

  it("two Super Admins locking each other at once leave one active Super Admin (security-10)", async () => {
    const a = await createUser(t.pool, "race_admin_a");
    const b = await createUser(t.pool, "race_admin_b");
    await grant(a, "super_admin");
    await grant(b, "super_admin");
    await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = $1", [superAdmin.userId]);
    try {
      for (let round = 0; round < 3; round++) {
        await t.pool.query("UPDATE users SET disabled_at = NULL WHERE id = ANY($1::text[])", [[a, b]]);
        const results = await Promise.allSettled([
          lockStaffUser(t.pool, { userId: a, roles: ["super_admin"] }, { userId: b, reason: "race a locks b" }),
          lockStaffUser(t.pool, { userId: b, roles: ["super_admin"] }, { userId: a, reason: "race b locks a" }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
        expect((refused.reason as CmsError).code).toBe("last_super_admin");
        const active = await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM users WHERE id = ANY($1::text[]) AND disabled_at IS NULL", [[a, b]]);
        expect(active.n).toBe(1);
      }
    } finally {
      await t.pool.query("UPDATE users SET disabled_at = NULL WHERE id = $1", [superAdmin.userId]);
      await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = ANY($1::text[])", [[a, b]]);
    }
  });

  it("an Admin lets people in as Researcher or Curator and does nothing else", async () => {
    const adminId = await createUser(t.pool, "plain_admin");
    await grant(adminId, "platform_admin");
    const admin: Actor = { userId: adminId, roles: ["platform_admin"] };
    const otherAdmin = await createUser(t.pool, "plain_admin_two");
    await grant(otherAdmin, "platform_admin");
    const waiting = await createUser(t.pool, "waiting_one");

    expect((await listStaffUsers(t.pool, admin)).some((u) => u.id === waiting)).toBe(true);
    await setStaffRole(t.pool, admin, { userId: waiting, role: "researcher" });
    await setStaffRole(t.pool, admin, { userId: waiting, role: "curator" });
    await lockStaffUser(t.pool, admin, { userId: waiting, reason: "on leave" });
    await unlockStaffUser(t.pool, admin, { userId: waiting });
    await revokeStaffRole(t.pool, admin, { userId: waiting });
    expect(await auditCount("admin.role_revoked", waiting)).toBe(1);
    const invite = await createInvite(t.pool, admin, { label: "Admin-made code" });
    await revokeInvite(t.pool, admin, { inviteId: invite.id });

    await expectCode(setStaffRole(t.pool, admin, { userId: waiting, role: "platform_admin" }), "super_admin_only");
    await expectCode(setStaffRole(t.pool, admin, { userId: waiting, role: "super_admin" }), "super_admin_only");
    await expectCode(setStaffRole(t.pool, admin, { userId: waiting, role: "researcher", principalInvestigator: true }), "super_admin_only");
    await expectCode(setStaffRole(t.pool, admin, { userId: otherAdmin, role: "curator" }), "super_admin_only");
    await expectCode(revokeStaffRole(t.pool, admin, { userId: otherAdmin }), "super_admin_only");
    await expectCode(revokeStaffRole(t.pool, admin, { userId: superAdmin.userId }), "super_admin_only");
    await expectCode(lockStaffUser(t.pool, admin, { userId: otherAdmin, reason: "not allowed" }), "super_admin_only");
    await expectCode(lockStaffUser(t.pool, admin, { userId: superAdmin.userId, reason: "not allowed" }), "super_admin_only");
    await expectCode(resetStaffPassword({ pool: t.pool, auth }, admin, { userId: superAdmin.userId, password: "a-new-password-22", reason: "not allowed" }), "super_admin_only");
    await expectCode(createStaffUser(deps(), admin, { name: "N", email: "n-admin@example.test", password: "a-long-password-1", role: "curator" }), "forbidden");
    await expectCode(roleHolderCounts(t.pool, admin), "forbidden");
    await expectCode(() => effectiveSettings(admin, {}), "forbidden");
    await expectCode(getHealthReport(t.pool, admin), "forbidden");
    await expectCode(queryAuditLog(t.pool, admin, parseAuditFilter({})), "forbidden");
    await expectCode(auditEntities(t.pool, admin), "forbidden");

    const pi = await createUser(t.pool, "pi_by_super");
    await setStaffRole(t.pool, superAdmin, { userId: pi, role: "researcher", principalInvestigator: true });
    await expectCode(setStaffRole(t.pool, admin, { userId: pi, role: "curator" }), "super_admin_only");
    await lockStaffUser(t.pool, admin, { userId: pi, reason: "researchers may be locked by an Admin" });
    await unlockStaffUser(t.pool, admin, { userId: pi });
    await setStaffRole(t.pool, superAdmin, { userId: otherAdmin, role: "super_admin" });
    await revokeStaffRole(t.pool, superAdmin, { userId: otherAdmin });
    await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = ANY($1::text[])", [[adminId, otherAdmin, pi, waiting]]);
  });

  it("makes a listed, verified sign-in address Super Admin on sign-in, once, audited as the system", async () => {
    const db = drizzle(t.pool, { schema, casing: "snake_case" });
    const listing = createAuth({ db, secret: "x".repeat(40) + "abcdefghijklmnop", baseURL: "http://localhost:3000", rateLimit: false, accountThrottle: false, superAdminEmails: ["lead@example.test"] });
    const { userId } = await createStaffUser(deps(), superAdmin, { name: "Lead", email: "Lead@Example.test", password: "the-lead-password-1", role: "curator" });
    expect((await listing.api.signInEmail({ body: { email: "lead@example.test", password: "the-lead-password-1" } })).token).toBeTruthy();
    expect((await one<{ role: string }>(t.pool, "SELECT role::text AS role FROM user_roles WHERE user_id = $1", [userId])).role).toBe("super_admin");
    await listing.api.signInEmail({ body: { email: "lead@example.test", password: "the-lead-password-1" } });
    const granted = await t.pool.query<{ actor_kind: string; before: unknown }>("SELECT actor_kind, before FROM audit_log WHERE action = 'admin.super_admin_granted' AND entity_id = $1", [userId]);
    expect(granted.rows).toEqual([{ actor_kind: "system", before: { role: "curator", principalInvestigator: false } }]);

    const unverified = await createUser(t.pool, "unverified_lead");
    const email = `${unverified}@example.test`;
    expect(await grantListedSuperAdmin(db, { id: unverified, email, emailVerified: false }, [email])).toBe(false);
    expect(await grantListedSuperAdmin(db, { id: unverified, email, emailVerified: true }, ["someone-else@example.test"])).toBe(false);
    expect((await t.pool.query("SELECT 1 FROM user_roles WHERE user_id = $1", [unverified])).rowCount).toBe(0);

    const plain = await createStaffUser(deps(), superAdmin, { name: "Not Listed", email: "not-listed@example.test", password: "a-long-password-1", role: "curator" });
    await auth.api.signInEmail({ body: { email: "not-listed@example.test", password: "a-long-password-1" } });
    expect((await one<{ role: string }>(t.pool, "SELECT role::text AS role FROM user_roles WHERE user_id = $1", [plain.userId])).role).toBe("curator");
    await setStaffRole(t.pool, superAdmin, { userId, role: "curator" });
    await t.pool.query("UPDATE users SET disabled_at = now() WHERE id = ANY($1::text[])", [[userId, plain.userId]]);
  });

  it("refuses self-lock; locking ends sessions and unlocking restores", async () => {
    await expectCode(lockStaffUser(t.pool, superAdmin, { userId: superAdmin.userId, reason: "myself" }), "self_lock");
    const target = await createUser(t.pool, "lock_target");
    await grant(target, "curator");
    await t.pool.query(
      "INSERT INTO auth_sessions (id, token, user_id, expires_at) VALUES ('s1', 'tok-1', $1, now() + interval '1 hour'), ('s2', 'tok-2', $1, now() + interval '1 hour')",
      [target],
    );
    const res = await lockStaffUser(t.pool, superAdmin, { userId: target, reason: "left the project" });
    expect(res.sessionsEnded).toBe(2);
    expect((await one<{ n: number }>(t.pool, "SELECT count(*)::int AS n FROM auth_sessions WHERE user_id = $1", [target])).n).toBe(0);
    expect((await one<{ d: Date | null }>(t.pool, "SELECT disabled_at AS d FROM users WHERE id = $1", [target])).d).not.toBeNull();
    const lockAudit = await one<{ reason: string }>(t.pool, "SELECT reason FROM audit_log WHERE action = 'admin.user_locked' AND entity_id = $1", [target]);
    expect(lockAudit.reason).toBe("left the project");
    await expectCode(lockStaffUser(t.pool, superAdmin, { userId: target, reason: "again" }), "already_locked");
    await unlockStaffUser(t.pool, superAdmin, { userId: target });
    expect(await auditCount("admin.user_unlocked", target)).toBe(1);
  });

  it("shows a sign-in lock in the user list and lets an administrator lift it, audited", async () => {
    const { userId } = await createStaffUser(deps(), superAdmin, { name: "Locked Out", email: "locked-out@example.test", password: "a-long-password-1", role: "curator" });
    const db = drizzle(t.pool, { schema, casing: "snake_case" });
    const limits = { maxAttempts: 2, windowSeconds: 900, lockSeconds: 900 };
    for (let i = 0; i < 3; i++) await consumeSignInAttempt(db, "locked-out@example.test", limits);
    const listed = (await listStaffUsers(t.pool, superAdmin)).find((u) => u.id === userId)!;
    expect(listed.signInLockedUntil).not.toBeNull();
    await expectCode(clearStaffSignInLock(t.pool, { userId: "x", roles: ["curator"] }, { userId, reason: "owner asked" }), "forbidden");
    expect(await clearStaffSignInLock(t.pool, superAdmin, { userId, reason: "owner locked out by mistyped password" })).toEqual({ wasLocked: true });
    expect((await listStaffUsers(t.pool, superAdmin)).find((u) => u.id === userId)!.signInLockedUntil).toBeNull();
    expect(await auditCount("admin.sign_in_lock_cleared", userId)).toBe(1);
    await expectCode(clearStaffSignInLock(t.pool, superAdmin, { userId, reason: "again" }), "not_sign_in_locked");
  });

  it("resets a staff password: the new one signs in, the old one does not, sessions end, audited without the password", async () => {
    const { userId } = await createStaffUser(deps(), superAdmin, { name: "Forgetful", email: "forgetful@example.test", password: "the-first-password-1", role: "curator" });
    const before = await auth.api.signInEmail({ body: { email: "forgetful@example.test", password: "the-first-password-1" } });
    expect(before.token).toBeTruthy();
    await expectCode(resetStaffPassword({ pool: t.pool, auth }, { userId: "x", roles: ["curator"] }, { userId, password: "a-new-password-22", reason: "forgotten" }), "forbidden");
    await expectCode(resetStaffPassword({ pool: t.pool, auth }, superAdmin, { userId: superAdmin.userId, password: "a-new-password-22", reason: "self" }), "self_reset");
    expect(await resetStaffPassword({ pool: t.pool, auth }, superAdmin, { userId, password: "a-new-password-22", reason: "forgotten password" })).toEqual({ sessionsEnded: 1 });
    await expect(auth.api.signInEmail({ body: { email: "forgetful@example.test", password: "the-first-password-1" } })).rejects.toThrow();
    expect((await auth.api.signInEmail({ body: { email: "forgetful@example.test", password: "a-new-password-22" } })).token).toBeTruthy();
    expect(await auditCount("admin.password_reset", userId)).toBe(1);
    const row = await one<{ after: unknown }>(t.pool, "SELECT after FROM audit_log WHERE action = 'admin.password_reset' AND entity_id = $1", [userId]);
    expect(JSON.stringify(row.after)).not.toContain("a-new-password-22");
    const google = await createUser(t.pool, "google_only");
    await grant(google, "curator");
    await expectCode(resetStaffPassword({ pool: t.pool, auth }, superAdmin, { userId: google, password: "a-new-password-22", reason: "no password" }), "no_password");
  });

  it("says whether Google sign-in is on and what that means for sign-up", () => {
    const text = (env: Record<string, string>) => JSON.stringify(effectiveSettings(superAdmin, env));
    expect(text({})).toContain("off: the Google OAuth client is not configured");
    expect(text({})).toContain("off; administrators create staff accounts");
    const on = text({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    expect(on).toContain("on: staff can sign in with Google");
    expect(on).toContain("anyone with a verified Google account who signs in gets an account with no role");
    expect(on).not.toContain("off; administrators create staff accounts");
  });

  it("reads the audit log with filters and pagination", async () => {
    const all = await queryAuditLog(t.pool, superAdmin, parseAuditFilter({}));
    expect(all.rows.length).toBeGreaterThan(0);
    expect(all.rows[0]!.actorName).toBeTruthy();
    const roles = await queryAuditLog(t.pool, superAdmin, parseAuditFilter({ action: "admin.role" }));
    expect(roles.rows.every((r) => r.action.startsWith("admin.role"))).toBe(true);
    const literal = await queryAuditLog(t.pool, superAdmin, parseAuditFilter({ action: "admin_" }));
    expect(literal.rows).toHaveLength(0);
    const reason = await queryAuditLog(t.pool, superAdmin, parseAuditFilter({ q: "left the" }));
    expect(reason.rows.map((r) => r.action)).toContain("admin.user_locked");
    const bad = parseAuditFilter({ page: "-3", from: "yesterday" });
    expect(bad.page).toBe(1);
    expect(bad.from).toBeUndefined();
    await expect(t.pool.query("UPDATE audit_log SET reason = 'x'")).rejects.toThrow(/append-only/);
  });

  it("reports health from the database and the migration journal", async () => {
    const h = await getHealthReport(t.pool, superAdmin, { journalPath: join(process.cwd(), "db", "migrations", "meta", "_journal.json"), env: {} });
    expect(h.database.ok).toBe(true);
    expect(h.migrations.ok && h.migrations.value.applied === h.migrations.value.expected).toBe(true);
    expect(h.telemetry.ok && h.telemetry.value.batchesTotal).toBe(0);
    expect(h.quarantine.ok && h.quarantine.value.unresolved).toBe(0);
    expect(h.storage.ok && h.storage.value.config.mode).toBe("local");
    const s3 = effectiveSettings(superAdmin, { MEDIA_S3_BUCKET: "bucket-a", APP_BUILD_VERSION: "b1" });
    expect(JSON.stringify(s3)).toContain("bucket-a");
    expect(JSON.stringify(s3)).not.toMatch(/SECRET|password=/i);
  });
});
