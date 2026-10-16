/**
 * Integration: staff accounts through Better Auth's real HTTP handler against episteme_test.
 * Covers the bootstrap path used by scripts/create-admin.ts, many-roles-per-user, sign-in
 * cookies (httpOnly, Secure + __Secure- prefix when secure), disabled sign-up, locked accounts
 * and the database-backed rate limit on sign-in.
 */
import { eq, inArray, like } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@db/schema";
import { authRateLimits, authSignInThrottle, users } from "@db/schema/auth";
import { clearSignInLock, knownDeviceThrottleKey, signInThrottleKey } from "@/server/auth/account-throttle";
import { createStaffAccount } from "@/server/auth/bootstrap";
import { createAuth, type Auth } from "@/server/auth/config";
import { loadUserRoles, revokeRole } from "@/server/auth/roles-repository";

const testUrl = process.env.TEST_DATABASE_URL;
const BASE = "http://localhost:3000";
const SECRET = "integration-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const RUN = Math.random().toString(36).slice(2, 10);
const email = (name: string) => `${name}-${RUN}@auth-test.invalid`;
const PASSWORD = "correct horse battery staple";

function post(path: string, body: unknown, ip: string, cookie?: string) {
  return new Request(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

/** Every email these tests sign in with (their throttle rows are removed afterwards). */
const THROTTLED_EMAILS = ["admin", "curator", "secure", "locked", "nobody", "target", "resets", "owner", "unlocked", ...Array.from({ length: 8 }, (_, i) => `rot${i}`)];

function sessionCookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie().find((c) => c.includes("session_token="));
  if (!raw) throw new Error("no session cookie set");
  return raw.split(";")[0]!;
}

describe.skipIf(!testUrl)("staff auth (Better Auth + user_roles)", () => {
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: NodePgDatabase<any>;
  let auth: Auth;
  let secureAuth: Auth;

  beforeAll(() => {
    pool = new Pool({ connectionString: testUrl, max: 4 });
    db = drizzle(pool, { schema, casing: "snake_case" });
    auth = createAuth({ db, secret: SECRET, baseURL: BASE, secureCookies: false });
    secureAuth = createAuth({ db, secret: SECRET, baseURL: BASE, secureCookies: true });
  });

  afterAll(async () => {
    await db.delete(users).where(like(users.email, `%-${RUN}@auth-test.invalid`));
    await db.delete(authRateLimits).where(like(authRateLimits.key, `%198.51.100.%`));
    await db
      .delete(authSignInThrottle)
      .where(inArray(authSignInThrottle.emailSha256, THROTTLED_EMAILS.flatMap((n) => [signInThrottleKey(email(n)), knownDeviceThrottleKey(email(n))])));
    await pool.end();
  });

  it("bootstraps an account with a role, idempotently, and supports several roles per user", async () => {
    const first = await createStaffAccount(auth, db, {
      email: email("Admin").toUpperCase(),
      name: "Demo Admin",
      password: PASSWORD,
      role: "platform_admin",
    });
    expect(first).toMatchObject({ created: true, roleGranted: true, roles: ["platform_admin"] });
    expect(first.email).toBe(email("admin"));

    const again = await createStaffAccount(auth, db, {
      email: email("admin"),
      name: "Ignored",
      password: "a different password that must not apply",
      role: "platform_admin",
    });
    expect(again).toMatchObject({ userId: first.userId, created: false, roleGranted: false });

    const second = await createStaffAccount(auth, db, {
      email: email("admin"),
      name: "Ignored",
      password: PASSWORD,
      role: "research_analyst",
    });
    expect(second.roleGranted).toBe(true);
    expect((await loadUserRoles(db, first.userId)).sort()).toEqual(["platform_admin", "research_analyst"]);

    expect(await revokeRole(db, first.userId, "research_analyst")).toBe(true);
    expect(await revokeRole(db, first.userId, "research_analyst")).toBe(false);
    expect(await loadUserRoles(db, first.userId)).toEqual(["platform_admin"]);

    // The original password still works (a re-run never overwrites it).
    const res = await auth.handler(post("/sign-in/email", { email: email("admin"), password: PASSWORD }, "198.51.100.1"));
    expect(res.status).toBe(200);
  });

  it("rejects weak passwords and unknown roles at bootstrap", async () => {
    await expect(
      createStaffAccount(auth, db, { email: email("weak"), name: "W", password: "short", role: "curator" }),
    ).rejects.toThrow();
    await expect(
      createStaffAccount(auth, db, {
        email: email("weak"),
        name: "W",
        password: PASSWORD,
        role: "participant" as never,
      }),
    ).rejects.toThrow();
    expect(await db.select().from(users).where(eq(users.email, email("weak")))).toHaveLength(0);
  });

  it("signs in through the HTTP handler with an httpOnly session cookie and resolves the session", async () => {
    const { userId } = await createStaffAccount(auth, db, {
      email: email("curator"),
      name: "Demo Curator",
      password: PASSWORD,
      role: "curator",
    });
    const res = await auth.handler(
      post("/sign-in/email", { email: email("curator"), password: PASSWORD }, "198.51.100.2"),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.getSetCookie().find((c) => c.includes("session_token="))!;
    expect(setCookie).toMatch(/^ie\.session_token=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);

    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookieFrom(res) }) });
    expect(session?.user.id).toBe(userId);
    expect(await loadUserRoles(db, userId)).toEqual(["curator"]);

    const bad = await auth.handler(
      post("/sign-in/email", { email: email("curator"), password: "wrong password entirely" }, "198.51.100.2"),
    );
    expect(bad.status).toBe(401);
  });

  it("uses Secure, __Secure- prefixed cookies when secure cookies are on", async () => {
    await createStaffAccount(auth, db, { email: email("secure"), name: "S", password: PASSWORD, role: "researcher" });
    const res = await secureAuth.handler(
      post("/sign-in/email", { email: email("secure"), password: PASSWORD }, "198.51.100.3"),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.getSetCookie().find((c) => c.includes("session_token="))!;
    expect(setCookie).toMatch(/^__Secure-ie\.session_token=/);
    expect(setCookie).toMatch(/;\s*Secure/i);
  });

  it("has public sign-up disabled", async () => {
    const res = await auth.handler(
      post("/sign-up/email", { email: email("intruder"), password: PASSWORD, name: "X" }, "198.51.100.4"),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(users).where(eq(users.email, email("intruder")))).toHaveLength(0);
  });

  it("refuses sign-in for a locked (disabled) account", async () => {
    const { userId } = await createStaffAccount(auth, db, {
      email: email("locked"),
      name: "L",
      password: PASSWORD,
      role: "content_editor",
    });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId));
    const res = await auth.handler(post("/sign-in/email", { email: email("locked"), password: PASSWORD }, "198.51.100.5"));
    expect(res.status).not.toBe(200);
    expect(res.headers.getSetCookie().some((c) => /session_token=[^;]+/.test(c) && !/Max-Age=0/i.test(c))).toBe(
      false,
    );
  });

  it("rate-limits sign-in attempts per IP (5 per minute)", async () => {
    const ip = "198.51.100.99";
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await auth.handler(
        post("/sign-in/email", { email: email("nobody"), password: "wrong password entirely" }, ip),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const rows = await db.select().from(authRateLimits).where(like(authRateLimits.key, `%${ip}%`));
    expect(rows.length).toBeGreaterThan(0);
    // Another IP is unaffected.
    const other = await auth.handler(
      post("/sign-in/email", { email: email("nobody"), password: "wrong password entirely" }, "198.51.100.98"),
    );
    expect(other.status).toBe(401);
    await db.delete(authRateLimits).where(inArray(authRateLimits.id, rows.map((r) => r.id)));
  });

  it("keys the IP limit on the proxy-appended hop, so a rotating spoofed X-Forwarded-For still hits 429", async () => {
    // Behind a reverse proxy at 203.0.113.250 that appends the address it saw (198.51.100.77).
    const proxied = createAuth({ db, secret: SECRET, baseURL: BASE, secureCookies: false, trustedProxies: ["203.0.113.250"] });
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const spoofed = `192.0.2.${i + 1}`;
      const res = await proxied.handler(
        post("/sign-in/email", { email: email(`rot${i}`), password: "wrong password entirely" }, `${spoofed}, 198.51.100.77, 203.0.113.250`),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
    // The bucket is the real client, never a spoofed value.
    const keys = (await db.select().from(authRateLimits).where(like(authRateLimits.key, "%sign-in%"))).map((r) => r.key);
    expect(keys.some((k) => k.startsWith("198.51.100.77|"))).toBe(true);
    expect(keys.some((k) => k.startsWith("192.0.2."))).toBe(false);
  });

  it("locks an account after 10 attempts from rotating IPs, then admits it again after a success elsewhere", async () => {
    await createStaffAccount(auth, db, { email: email("target"), name: "T", password: PASSWORD, role: "curator" });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await auth.handler(
        post("/sign-in/email", { email: email("target"), password: "wrong password entirely" }, `198.51.100.${120 + i}`),
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Locked: even the right password from a fresh IP is refused, with a Retry-After.
    const locked = await auth.handler(post("/sign-in/email", { email: email("TARGET"), password: PASSWORD }, "198.51.100.140"));
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);

    // A successful sign-in clears the counter.
    await createStaffAccount(auth, db, { email: email("resets"), name: "R", password: PASSWORD, role: "curator" });
    for (let i = 0; i < 3; i++) {
      await auth.handler(post("/sign-in/email", { email: email("resets"), password: "wrong password entirely" }, `198.51.100.${150 + i}`));
    }
    const ok = await auth.handler(post("/sign-in/email", { email: email("resets"), password: PASSWORD }, "198.51.100.160"));
    expect(ok.status).toBe(200);
    const left = await db.select().from(authSignInThrottle).where(eq(authSignInThrottle.emailSha256, signInThrottleKey(email("resets"))));
    expect(left).toHaveLength(0);
  });

  it("a stranger's lock does not shut out the owner's known browser (security-09)", async () => {
    await createStaffAccount(auth, db, { email: email("owner"), name: "O", password: PASSWORD, role: "principal_investigator" });
    // The owner signed in from this browser before: it now carries the signed known-device cookie.
    const first = await auth.handler(post("/sign-in/email", { email: email("owner"), password: PASSWORD }, "198.51.100.170"));
    expect(first.status).toBe(200);
    const deviceRaw = first.headers.getSetCookie().find((c) => c.includes("known_device="));
    expect(deviceRaw).toBeDefined();
    expect(deviceRaw).toMatch(/HttpOnly/i);
    expect(deviceRaw).not.toContain(email("owner"));
    const device = deviceRaw!.split(";")[0]!;

    // A stranger who only knows the email locks it from rotating IPs.
    for (let i = 0; i < 11; i++) {
      await auth.handler(post("/sign-in/email", { email: email("owner"), password: "wrong password entirely" }, `198.51.100.${171 + i}`));
    }
    const stranger = await auth.handler(post("/sign-in/email", { email: email("owner"), password: PASSWORD }, "198.51.100.190"));
    expect(stranger.status).toBe(429);
    // A forged or foreign device cookie does not help.
    const forged = await auth.handler(post("/sign-in/email", { email: email("owner"), password: PASSWORD }, "198.51.100.192", `${device.split("=")[0]}=${signInThrottleKey(email("owner"))}.bad`));
    expect(forged.status).toBe(429);
    // The owner's browser is counted in its own bucket and still gets in with the right password.
    const owner = await auth.handler(post("/sign-in/email", { email: email("owner"), password: PASSWORD }, "198.51.100.191", device));
    expect(owner.status).toBe(200);
  });

  it("guessing from a known browser is still capped, and an administrator can clear a lock", async () => {
    await createStaffAccount(auth, db, { email: email("unlocked"), name: "U", password: PASSWORD, role: "curator" });
    const first = await auth.handler(post("/sign-in/email", { email: email("unlocked"), password: PASSWORD }, "198.51.100.200"));
    const device = first.headers.getSetCookie().find((c) => c.includes("known_device="))!.split(";")[0]!;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await auth.handler(post("/sign-in/email", { email: email("unlocked"), password: "wrong password entirely" }, `198.51.100.${201 + i}`, device));
      statuses.push(res.status);
    }
    expect(statuses[10]).toBe(429);
    expect((await clearSignInLock(db, email("unlocked"))).wasLocked).toBe(true);
    const ok = await auth.handler(post("/sign-in/email", { email: email("unlocked"), password: PASSWORD }, "198.51.100.215", device));
    expect(ok.status).toBe(200);
  });
});
