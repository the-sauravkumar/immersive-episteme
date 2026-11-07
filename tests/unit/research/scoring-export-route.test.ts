import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ held: new Set<string>(), audits: [] as unknown[][] }));

vi.mock("@/server/auth/staff", () => ({
  authorizeRequest: async (permission: string | readonly string[]) => {
    const anyOf = typeof permission === "string" ? [permission] : permission;
    if (state.held.size === 0) return { ok: false, response: Response.json({ error: "unauthenticated" }, { status: 401 }) };
    if (!anyOf.some((p) => state.held.has(p))) return { ok: false, response: Response.json({ error: "forbidden" }, { status: 403 }) };
    return { ok: true, principal: { kind: "staff", userId: "u-1", email: "r@example.test", roles: [] } };
  },
}));
vi.mock("@/server/db/client", () => ({ getPool: () => ({}) }));
vi.mock("@/server/research/db", () => ({
  audit: async (...args: unknown[]) => {
    state.audits.push(args);
  },
}));
vi.mock("@/server/assessment/scoring", () => ({
  SCORE_EXPORT_COLUMNS: ["participant_code", "value"],
  EDGE_EXPORT_COLUMNS: ["participant_code", "edge_key"],
  exportScores: async () => [{ participant_code: "P-1", value: 1 }],
  exportMapEdges: async () => [{ participant_code: "P-1", edge_key: "e1" }],
  toCsv: (columns: string[], rows: Record<string, unknown>[]) => [columns.join(","), ...rows.map((r) => columns.map((c) => String(r[c])).join(","))].join("\r\n"),
}));

const { GET } = await import("@/app/(research)/research/scoring/export/route");

const get = (query: string) => GET(new Request(`http://localhost/research/scoring/export?${query}`));

describe("GET /research/scoring/export", () => {
  beforeEach(() => {
    state.held = new Set();
    state.audits = [];
  });

  it("refuses a role that can score but cannot export", async () => {
    state.held = new Set(["assessments.score"]);
    const r = await get("dataset=scores&format=csv");
    expect(r.status).toBe(403);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(state.audits).toEqual([]);
  });

  it("records every download in the audit log", async () => {
    state.held = new Set(["exports.create"]);
    const assessment = "0190a3c2-1111-7000-8000-000000000001";
    const scores = await get(`dataset=scores&format=csv&assessment=${assessment}`);
    expect(scores.status).toBe(200);
    expect(await scores.text()).toBe("participant_code,value\r\nP-1,1");
    const edges = await get("dataset=map-edges&format=json");
    expect(edges.status).toBe(200);
    expect(state.audits.map(([, actor, action, entity, entityId, change]) => ({ actor, action, entity, entityId, change }))).toEqual([
      { actor: { userId: "u-1" }, action: "export.scoring", entity: "assessment", entityId: assessment, change: { after: { dataset: "scores", format: "csv", scope: "pseudonymised", rows: 1, assessment } } },
      { actor: { userId: "u-1" }, action: "export.scoring", entity: "assessment", entityId: null, change: { after: { dataset: "map-edges", format: "json", scope: "pseudonymised", rows: 1, assessment: "all" } } },
    ]);
  });

  it("refuses an unknown dataset without exporting anything", async () => {
    state.held = new Set(["exports.create"]);
    expect((await get("dataset=everything")).status).toBe(400);
    expect(state.audits).toEqual([]);
  });
});
