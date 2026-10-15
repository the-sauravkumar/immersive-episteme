/** Request coalescing of the research dashboard: single-flight, memo only under an unchanged key. */
import { describe, expect, it } from "vitest";

import type { DashboardData } from "../../../src/server/research/dashboard";
import { DashboardCoalescer } from "../../../src/server/research/dashboard-cache";

function setup() {
  const state = { fp: "f1", version: "1:0" as string | null, loads: 0, time: 0 };
  let release: () => void = () => {};
  let gate: Promise<void> | null = null;
  const c = new DashboardCoalescer({
    fingerprint: async () => ({ serverTime: new Date(Date.UTC(2026, 0, 1, 0, 0, ++state.time)).toISOString(), fingerprint: state.fp }),
    load: async (_id, fp) => {
      state.loads++;
      if (gate) await gate;
      return { generatedAt: fp.serverTime, fingerprint: fp.fingerprint } as DashboardData;
    },
    version: () => state.version,
  });
  const hold = () => {
    gate = new Promise((r) => (release = r));
  };
  return { c, state, hold, release: () => release() };
}

describe("dashboard coalescer", () => {
  it("shares one computation between concurrent viewers", async () => {
    const { c, state, hold, release } = setup();
    hold();
    const all = Promise.all([c.get("s"), c.get("s"), c.get("s")]);
    await new Promise((r) => setTimeout(r, 10));
    release();
    const served = await all;
    expect(state.loads).toBe(1);
    expect(served.map((x) => x.source).sort()).toEqual(["computed", "shared", "shared"]);
  });

  it("serves the memo while nothing changed, with the time of the fresh check", async () => {
    const { c, state } = setup();
    const a = await c.get("s");
    const b = await c.get("s");
    expect(state.loads).toBe(1);
    expect(b.source).toBe("memo");
    expect(b.data!.generatedAt > a.data!.generatedAt).toBe(true);
  });

  it("recomputes when a notification arrives or the fingerprint moves, and never memoises unlistened", async () => {
    const { c, state } = setup();
    await c.get("s");
    state.version = "1:1";
    expect((await c.get("s")).source).toBe("computed");
    state.fp = "f2";
    expect((await c.get("s")).source).toBe("computed");
    state.version = null;
    expect((await c.get("s")).source).toBe("computed");
    expect((await c.get("s")).source).toBe("computed");
    expect(state.loads).toBe(5);
  });

  it("does not memoise a result whose computation overlapped a notification", async () => {
    const { c, state, hold, release } = setup();
    hold();
    const p = c.get("s");
    await new Promise((r) => setTimeout(r, 10));
    state.version = "1:1";
    release();
    await p;
    state.version = "1:0";
    expect((await c.get("s")).source).toBe("computed");
  });
});
