import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ revoked: new Set<string>(), staffTokens: new Set<string>(), down: false }));

vi.mock("@/server/access/gate-lookups", () => ({
  inviteIsLive: async (id: string) => {
    if (gate.down) throw new Error("database unreachable");
    return !gate.revoked.has(id);
  },
  sessionHoldsStaffRole: async (headers: Headers) => {
    if (gate.down) throw new Error("database unreachable");
    const token = /ie\.session_token=([^;]+)/.exec(headers.get("cookie") ?? "")?.[1];
    return token !== undefined && gate.staffTokens.has(token);
  },
}));

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
  gate.revoked.clear();
  gate.staffTokens.clear();
  gate.down = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("invite gate (S11)", () => {
  it("redirects every gated page to /invite, remembering where the visitor was going", async () => {
    for (const path of ["/", "/explore", "/study", "/learn/2d", "/learn/immersive", "/figures/0190f3a4-1b2c-7d3e-8f40-123456789abc"]) {
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

  it("admits a valid invite cookie and a staff session the database confirms", async () => {
    const cookie = await invited();
    gate.staffTokens.add("real-staff-token");
    expect((await at("/", { headers: cookie })).status).toBe(200);
    expect((await at("/explore", { headers: cookie })).status).toBe(200);
    expect((await at("/", { headers: { cookie: "ie.session_token=real-staff-token" } })).status).toBe(200);
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

  it("locks out a browser holding a revoked code on its next request", async () => {
    const cookie = await invited();
    expect((await at("/study", { headers: cookie })).status).toBe(200);
    gate.revoked.add(INVITE_ID);
    for (const path of ["/", "/study", "/study/consent", "/explore"]) expect(location(await at(path, { headers: cookie })), path).toBe(`/invite${path === "/" ? "" : `?next=${encodeURIComponent(path)}`}`);
    expect((await at("/explore", { method: "POST", headers: cookie })).status).toBe(403);
  });

  it("refuses a forged staff session cookie that the database does not confirm", async () => {
    for (const name of ["ie.session_token", "__Secure-ie.session_token"]) {
      expect(location(await at("/study/consent", { headers: { cookie: `${name}=forged` } })), name).toBe("/invite?next=%2Fstudy%2Fconsent");
    }
  });

  it("answers 503 instead of guessing when the database cannot be reached", async () => {
    gate.down = true;
    const res = await at("/", { headers: await invited() });
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sends ?invite= to the invite page with the code filled in, redeeming nothing until the visitor presses Continue", async () => {
    const res = await at("/study?code=demo-x&invite=ABCD-EFGH");
    expect(res.status).toBe(307);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const target = new URL(res.headers.get("location")!);
    expect(target.pathname).toBe("/invite");
    expect(target.searchParams.get("code")).toBe("ABCD-EFGH");
    expect(target.searchParams.get("next")).toBe("/study?code=demo-x");
  });

  it("refuses the participant APIs to a browser without a live invite", async () => {
    expect((await at("/api/telemetry/batch", { method: "POST" })).status).toBe(403);
    expect((await at("/api/study/learning-progress", { method: "POST", headers: await invited() })).status).toBe(200);
  });

  it("drops ?invite= without redeeming it again when the browser is already admitted", async () => {
    const res = await at("/?invite=ABCD", { headers: await invited() });
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
