import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  principal: null as null | { roles: readonly string[] },
  redirected: [] as string[],
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    state.redirected.push(to);
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<object>()), cache: <T>(fn: T) => fn }));
vi.mock("@/server/auth/staff", () => ({ getStaffPrincipal: async () => state.principal }));
vi.mock("@/server/access/gate-lookups", () => ({ inviteIsLive: async () => true }));

const { hasSiteAccess, requireSiteAccess } = await import("@/server/access/site-access");

describe("server-side invite gate", () => {
  beforeEach(() => {
    state.principal = null;
    state.redirected = [];
  });

  it("refuses a signed-in account that holds no staff role, as a fresh Google sign-up does", async () => {
    state.principal = { roles: [] };
    expect(await hasSiteAccess()).toBe(false);
    await expect(requireSiteAccess("/study")).rejects.toThrow("redirect");
    expect(state.redirected).toEqual(["/invite?next=%2Fstudy"]);
  });

  it("refuses a visitor with neither an invite nor a session", async () => {
    expect(await hasSiteAccess()).toBe(false);
  });

  it("admits a signed-in account that holds a staff role", async () => {
    state.principal = { roles: ["researcher"] };
    expect(await hasSiteAccess()).toBe(true);
    await expect(requireSiteAccess("/explore")).resolves.toBeUndefined();
  });
});
