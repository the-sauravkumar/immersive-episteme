/**
 * POST /api/telemetry/batch body limit (final review security-08): a chunked body with no
 * Content-Length is cut off at MAX_BATCH_BYTES while it streams (413), instead of being buffered
 * whole by request.text() first. Identity and storage are stubbed; only the route is under test.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_BATCH_BYTES } from "@/features/telemetry/contracts";

const ingested: unknown[] = [];
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ BETTER_AUTH_SECRET: "x".repeat(32) }) }));
vi.mock("@/server/auth/staff", () => ({ getStaffPrincipal: async () => null }));
vi.mock("@/server/db/client", () => ({ getPool: () => null }));
vi.mock("@/server/telemetry/principal", () => ({
  resolveTelemetryPrincipal: async () => ({ ok: true, principal: { kind: "demo", demoId: "d".repeat(32) } }),
  principalKey: () => `demo:${Math.random()}`,
}));
vi.mock("@/server/telemetry/ingest", () => ({
  ingestTelemetryBatch: async (_pool: unknown, _who: unknown, body: unknown) => {
    ingested.push(body);
    return { status: 200, body: { ok: true } };
  },
}));

const { POST } = await import("@/app/api/telemetry/batch/route");

/** A streamed body of `total` bytes in 64 KiB chunks; counts how many bytes were pulled. */
function stream(total: number) {
  const chunk = new Uint8Array(64 * 1024).fill(0x20);
  let sent = 0;
  const s = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(chunk.byteLength, total - sent);
      sent += n;
      c.enqueue(chunk.subarray(0, n));
    },
  });
  return { body: s, pulled: () => sent };
}

const post = (body: BodyInit) =>
  POST(new NextRequest("http://localhost:3300/api/telemetry/batch", { method: "POST", body, duplex: "half", headers: { "content-type": "application/json" } } as ConstructorParameters<typeof NextRequest>[1]));

describe("telemetry batch route body limit", () => {
  beforeEach(() => {
    ingested.length = 0;
  });

  it("refuses a chunked body over the limit with 413 without reading it all", async () => {
    const big = stream(64 * 1024 * 1024);
    const req = post(big.body);
    const res = await req;
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "payload_too_large" });
    expect(big.pulled()).toBeLessThan(MAX_BATCH_BYTES + 4 * 64 * 1024);
    expect(ingested).toHaveLength(0);
  });

  it("passes a body within the limit to ingest", async () => {
    const res = await post(JSON.stringify({ hello: "world" }));
    expect(res.status).toBe(200);
    expect(ingested).toEqual([{ hello: "world" }]);
  });

  it("answers 400 for a body that is not JSON", async () => {
    const res = await post("not json");
    expect(res.status).toBe(400);
  });
});
