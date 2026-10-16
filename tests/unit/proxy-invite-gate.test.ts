/**
 * src/proxy.ts invite gate (deployment source change S11): the contract scripts/deploy/smoke.ts
 * checks on a deployment (docs/deploy/RUNBOOK.md "Invite-only access"), here without a server.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signInviteAccess } from "@/server/access/invite-cookie";
import { INVITE_COOKIE } from "@/server/auth/cookie-names";
import { proxy } from "@/proxy";

const SECRET = "proxy-test-secret-abcdefghijklmnopqrstuvwxyz-0123456789";
const INVITE_ID = "0190f3a4-1b2c-7d3e-8f40-123456789abc";

async function invited(): Promise<Record<string, string>> {
  return { cookie: `${INVITE_COOKIE}=${await signInviteAccess(INVITE_ID, SECRET)}` };
}

const at = (path: string, init: { headers?: Record<string, string>; method?: string } = {}) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers: init.headers ?? {} }));

const location = (res: Response) => {
  const l = res.headers.get("location");
  return l ? `${new URL(l).pathname}${new URL(l).search}` : null;
};

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("invite gate (S11)", () => {
  it("redirects every gated page to /invite, remembering where the visitor was going", async () => {
    for (const path of ["/", "/explore", "/study", "/about", "/learn/2d", "/learn/immersive", "/figures/0190f3a4-1b2c-7d3e-8f40-123456789abc"]) {
      const res = await at(path);
      expect(res.status, path).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname, path).toBe("/invite");
    }
    expect(location(await at("/"))).toBe("/invite");
    expect(location(await at("/study?code=demo-x"))).toBe("/invite?next=%2Fstudy%3Fcode%3Ddemo-x");
  });

  it("answers 403 to a non-GET request without an invite (Server Actions on gated pages)", async () => {
    const res = await at("/explore", { method: "POST" });
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("keeps sign-in, the invite page, staff home and the auth API reachable, and staff areas on /sign-in", async () => {
    for (const path of ["/invite", "/invite?next=%2Fstudy", "/sign-in", "/forbidden", "/console", "/api/auth/ok"]) {
      const res = await at(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("location"), path).toBeNull();
    }
    expect(location(await at("/research"))).toBe("/sign-in?next=%2Fresearch");
  });

  it("admits a valid invite cookie and a staff session cookie", async () => {
    const cookie = await invited();
    expect((await at("/", { headers: cookie })).status).toBe(200);
    expect((await at("/explore", { headers: cookie })).status).toBe(200);
    expect((await at("/", { headers: { cookie: "ie.session_token=anything" } })).status).toBe(200);
    // The participant guard still applies behind the gate.
    expect(location(await at("/learn/2d", { headers: cookie }))).toBe("/study");
  });

  it("refuses a forged, expired or foreign-secret invite cookie, and every cookie without a secret", async () => {
    const forged = { cookie: `${INVITE_COOKIE}=v1.e30.${"A".repeat(43)}` };
    const expired = { cookie: `${INVITE_COOKIE}=${await signInviteAccess(INVITE_ID, SECRET, { now: 1_000, ttlSeconds: 60 })}` };
    const foreign = { cookie: `${INVITE_COOKIE}=${await signInviteAccess(INVITE_ID, `${SECRET}-other`)}` };
    for (const headers of [forged, expired, foreign]) expect(location(await at("/", { headers }))).toBe("/invite");
    const cookie = await invited();
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(location(await at("/", { headers: cookie }))).toBe("/invite");
  });

  it("rewrites ?invite= to the redeem route with the code and the clean target, setting no cookie itself", async () => {
    const res = await at("/study?code=demo-x&invite=ABCD-EFGH");
    const rewrite = new URL(res.headers.get("x-middleware-rewrite")!);
    expect(rewrite.pathname).toBe("/invite/redeem");
    expect(rewrite.searchParams.get("code")).toBe("ABCD-EFGH");
    expect(rewrite.searchParams.get("next")).toBe("/study?code=demo-x");
    expect(res.headers.get("set-cookie")).toBeNull();
    // The rewrite keeps the original query (where `code` is the study slug), so the redeem route
    // reads the invite and the target from request headers (DR-067).
    expect(res.headers.get("x-middleware-request-x-invite-redeem-code")).toBe(encodeURIComponent("ABCD-EFGH"));
    expect(res.headers.get("x-middleware-request-x-invite-redeem-next")).toBe(encodeURIComponent("/study?code=demo-x"));
  });

  it("drops ?invite= without redeeming it again when the browser is already admitted", async () => {
    const res = await at("/?invite=ABCD", { headers: await invited() });
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
