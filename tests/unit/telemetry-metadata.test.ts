/**
 * Telemetry metadata is an explicit per-event-type allowlist (src/features/telemetry/contracts.ts).
 * Regression: the old key denylist (/email|name|phone|ip|address/ as a substring) rejected
 * legitimate keys such as relationshipId (relationsh-IP-Id) and let any value through.
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { EVENT_METADATA_SCHEMAS, EVENT_TYPE_CODES, telemetryEventSchema } from "@/features/telemetry/contracts";

const base = () => ({
  eventId: randomUUID(),
  schemaVersion: 1 as const,
  sessionId: randomUUID(),
  seq: 1,
  clientTs: new Date().toISOString(),
});

const parse = (type: string, metadata: unknown) => telemetryEventSchema.safeParse({ ...base(), type, metadata });

describe("telemetry metadata allowlist", () => {
  it("covers every registered event type", () => {
    expect(Object.keys(EVENT_METADATA_SCHEMAS).sort()).toEqual([...EVENT_TYPE_CODES].sort());
  });

  it("accepts relationship traversal with its relationship id and type", () => {
    const r = parse("relationship_followed", {
      relationshipId: randomUUID(),
      relationshipTypeCode: "PRECEDES",
      fromConceptId: randomUUID(),
      toConceptId: randomUUID(),
      direction: "forward",
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["knowledge_layer_selected", { layer: "science" }],
    ["concept_encountered", { mode: "opened" }],
    ["guidance_cue_used", { action: "dismissed", cueId: "cue-3" }],
    ["visibility_changed", { visible: false }],
    ["render_quality_changed", { from: "high", to: "low" }],
    ["page_exited", { dwellMs: 1200, scrollDepth: 0.5 }],
    ["client_error", { messageSha256: "a".repeat(64), source: "window" }],
    ["session_started", {}],
  ])("accepts documented keys for %s", (type, metadata) => {
    expect(parse(type, metadata).success).toBe(true);
  });

  it.each([
    ["an unknown key", "page_entered", { description: "free text" }],
    ["personal data keys", "page_entered", { email: "x@example.test" }],
    ["a missing required key", "relationship_followed", { relationshipTypeCode: "PRECEDES" }],
    ["a malformed relationship type", "relationship_followed", { relationshipId: randomUUID(), relationshipTypeCode: "precedes" }],
    ["free-text query", "query_submitted", { query: "my name is ..." }],
    ["a raw error message", "client_error", { message: "TypeError at user@example.test" }],
    ["an out-of-range value", "knowledge_layer_selected", { layer: "gossip" }],
  ])("rejects %s", (_label, type, metadata) => {
    const r = parse(type, metadata);
    expect(r.success).toBe(false);
  });

  it("still bounds metadata size", () => {
    expect(parse("render_quality_changed", { from: "a", to: "b".repeat(5000) }).success).toBe(false);
  });
});
