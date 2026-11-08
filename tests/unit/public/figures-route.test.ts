import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  figure: null as null | Error | Record<string, unknown>,
  storage: { mode: "local" as const, read: vi.fn(async (_key: string): Promise<Uint8Array> => new Uint8Array([1, 2, 3])) },
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => undefined }));
vi.mock("@/server/db/client", () => ({ getPool: () => ({}) }));
vi.mock("@/server/cms/media/storage", () => ({ getMediaStorage: () => state.storage }));
vi.mock("@/server/cms/media/service", () => ({
  FIGURE_MAX_AGE: 300,
  loadLearnerFigure: async () => {
    if (state.figure instanceof Error) throw state.figure;
    return state.figure;
  },
}));

const { GET } = await import("@/app/figures/[assetId]/route");

const ID = "0190f3a4-1b2c-7d3e-8f40-123456789abc";
const get = () => GET(new NextRequest(`http://localhost:3000/figures/${ID}`), { params: Promise.resolve({ assetId: ID }) } as never);
const FIGURE = { id: ID, storageKey: "sha256/aa/a.png", mimeType: "image/png", sha256: "a".repeat(64) };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.storage.read.mockReset();
  state.storage.read.mockResolvedValue(new Uint8Array([1, 2, 3]));
});
afterEach(() => logged.mockRestore());

describe("GET /figures/<id> (DR-114)", () => {
  it("answers 404 for a figure that may not be shown", async () => {
    state.figure = null;
    const res = await get();
    expect(res.status).toBe(404);
    expect(logged).not.toHaveBeenCalled();
  });

  it("logs a database failure and answers 503, never a silent 404", async () => {
    state.figure = new Error("connection terminated");
    const res = await get();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("[figures] database failure"), expect.any(Error));
  });

  it("logs a storage failure and answers 503", async () => {
    state.figure = FIGURE;
    state.storage.read.mockRejectedValue(new Error("ENOENT"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("[figures] storage failure"), expect.any(Error));
  });

  it("serves a servable figure", async () => {
    state.figure = FIGURE;
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("private, max-age=300, must-revalidate");
  });
});
