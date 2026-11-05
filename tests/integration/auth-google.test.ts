import { and, eq, like } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@db/schema";
import { authAccounts, users } from "@db/schema/auth";
import { createStaffAccount } from "@/server/auth/bootstrap";
import { createAuth, type Auth } from "@/server/auth/config";
import { loadUserRoles } from "@/server/auth/roles-repository";

const testUrl = process.env.TEST_DATABASE_URL;
const BASE = "http://localhost:3000";
const SECRET = "integration-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
const RUN = Math.random().toString(36).slice(2, 10);
const DOMAIN = "google-test.invalid";
const email = (name: string) => `${name}-${RUN}@${DOMAIN}`;
const PASSWORD = "correct horse battery staple";
const GOOGLE = { clientId: "1234567890-integration.apps.googleusercontent.com", clientSecret: "GOCSPX-integration-secret" };
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

type GoogleIdentity = { sub: string; email: string; emailVerified: boolean; name?: string };

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function idTokenFor(identity: GoogleIdentity): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://accounts.google.com",
    aud: GOOGLE.clientId,
    sub: identity.sub,
    email: identity.email,
    email_verified: identity.emailVerified,
    name: identity.name ?? "Google Person",
    iat: now,
    exp: now + 3600,
  };
  return `${base64url({ alg: "RS256", typ: "JWT", kid: "test" })}.${base64url(claims)}.c2lnbmF0dXJl`;
}

function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

function hasSessionCookie(res: Response): boolean {
  return res.headers.getSetCookie().some((c) => c.includes("session_token=") && !c.includes("session_token=;"));
}

function startRequest(body: unknown): Request {
  return new Request(`${BASE}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "198.51.100.77" },
    body: JSON.stringify(body),
  });
}

async function signInWithGoogle(auth: Auth, identity: GoogleIdentity): Promise<{ location: URL; signedIn: boolean }> {
  const start = await auth.handler(
    startRequest({ provider: "google", callbackURL: "/console", newUserCallbackURL: "/awaiting-access", errorCallbackURL: "/sign-in" }),
  );
  expect(start.status).toBe(200);
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  expect(state).toBeTruthy();
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const target = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (target.startsWith(TOKEN_ENDPOINT)) {
      return Response.json({ access_token: "ya29.test", id_token: idTokenFor(identity), token_type: "Bearer", expires_in: 3599, scope: "openid email profile" });
    }
    return realFetch(input, init);
  });
  const callback = await auth.handler(
    new Request(`${BASE}/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state!)}`, {
      headers: { cookie: cookiesFrom(start), "x-forwarded-for": "198.51.100.77" },
    }),
  );
  expect(callback.status).toBe(302);
  return { location: new URL(callback.headers.get("location")!, BASE), signedIn: hasSessionCookie(callback) };
}

describe.skipIf(!testUrl)("staff Google sign-in (Better Auth + user_roles)", () => {
  let pool: Pool;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: NodePgDatabase<any>;
  let auth: Auth;

  beforeAll(() => {
    pool = new Pool({ connectionString: testUrl, max: 4 });
    db = drizzle(pool, { schema, casing: "snake_case" });
    auth = createAuth({ db, secret: SECRET, baseURL: BASE, secureCookies: false, rateLimit: false, accountThrottle: false, google: GOOGLE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.delete(users).where(like(users.email, `%-${RUN}@${DOMAIN}`));
    await pool.end();
  });

  async function userByEmail(address: string) {
    const [row] = await db.select().from(users).where(eq(users.email, address)).limit(1);
    return row;
  }

  async function googleAccountsOf(userId: string) {
    return db.select().from(authAccounts).where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, "google")));
  }

  it("signs up a new Google account with a verified email with no roles, and sends it to the waiting page", async () => {
    const address = email("newcomer");
    const result = await signInWithGoogle(auth, { sub: `sub-newcomer-${RUN}`, email: address, emailVerified: true });
    expect(result.location.pathname).toBe("/awaiting-access");
    expect(result.signedIn).toBe(true);
    const user = await userByEmail(address);
    expect(user).toBeDefined();
    expect(user!.emailVerified).toBe(true);
    expect(await loadUserRoles(db, user!.id)).toEqual([]);
    expect(await googleAccountsOf(user!.id)).toHaveLength(1);
  });

  it("makes no account for a Google email that Google has not verified", async () => {
    const address = email("unverified-new");
    const result = await signInWithGoogle(auth, { sub: `sub-unverified-new-${RUN}`, email: address, emailVerified: false });
    expect(result.location.pathname).toBe("/sign-in");
    expect(result.location.searchParams.get("error")).toBe("unable_to_create_user");
    expect(result.signedIn).toBe(false);
    expect(await userByEmail(address)).toBeUndefined();
  });

  it("links a verified Google email to the existing staff account and keeps its roles", async () => {
    const staff = await createStaffAccount(auth, db, { email: email("researcher"), name: "Staff Researcher", password: PASSWORD, role: "researcher" });
    const result = await signInWithGoogle(auth, { sub: `sub-researcher-${RUN}`, email: staff.email, emailVerified: true, name: "Different Google Name" });
    expect(result.location.pathname).toBe("/console");
    expect(result.signedIn).toBe(true);
    const linked = await googleAccountsOf(staff.userId);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.accountId).toBe(`sub-researcher-${RUN}`);
    expect(await loadUserRoles(db, staff.userId)).toEqual(["researcher"]);
    expect((await userByEmail(staff.email))!.name).toBe("Staff Researcher");
    const [{ n }] = (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE email = $1", [staff.email])).rows as [{ n: number }];
    expect(n).toBe(1);
  });

  it("does not link a Google email that Google has not verified", async () => {
    const staff = await createStaffAccount(auth, db, { email: email("curator"), name: "Staff Curator", password: PASSWORD, role: "curator" });
    const result = await signInWithGoogle(auth, { sub: `sub-curator-${RUN}`, email: staff.email, emailVerified: false });
    expect(result.location.pathname).toBe("/sign-in");
    expect(result.location.searchParams.get("error")).toBe("account_not_linked");
    expect(result.signedIn).toBe(false);
    expect(await googleAccountsOf(staff.userId)).toHaveLength(0);
  });

  it("refuses a locked account, linked or not", async () => {
    const staff = await createStaffAccount(auth, db, { email: email("locked"), name: "Locked Staff", password: PASSWORD, role: "researcher" });
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, staff.userId));
    const first = await signInWithGoogle(auth, { sub: `sub-locked-${RUN}`, email: staff.email, emailVerified: true });
    expect(first.location.searchParams.get("error")).toBe("unable_to_create_session");
    expect(first.signedIn).toBe(false);
    vi.restoreAllMocks();
    const again = await signInWithGoogle(auth, { sub: `sub-locked-${RUN}`, email: staff.email, emailVerified: true });
    expect(again.location.searchParams.get("error")).toBe("unable_to_create_session");
    expect(again.signedIn).toBe(false);
  });

  it("refuses extra scopes, other providers and session linking before reaching Google", async () => {
    for (const body of [
      { provider: "google", callbackURL: "/console", scopes: ["https://www.googleapis.com/auth/drive"] },
      { provider: "google", callbackURL: "/console", idToken: { token: idTokenFor({ sub: "x", email: email("shortcut"), emailVerified: true }) } },
      { provider: "github", callbackURL: "/console" },
    ]) {
      const res = await auth.handler(startRequest(body));
      expect(res.status).toBe(403);
    }
    expect(await userByEmail(email("shortcut"))).toBeUndefined();
  });

  it("offers no Google provider when it is not configured", async () => {
    const plain = createAuth({ db, secret: SECRET, baseURL: BASE, secureCookies: false, rateLimit: false, accountThrottle: false });
    const res = await plain.handler(startRequest({ provider: "google", callbackURL: "/console" }));
    expect(res.status).toBe(404);
  });
});
