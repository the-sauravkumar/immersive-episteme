/**
 * Zod contracts mirror the database rules (no database needed).
 */
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canTransition, conceptInputSchema, relationshipTypeSchema, verificationTransitionSchema } from "../../src/features/knowledge/contracts";
import { conceptMapSubmissionSchema, assessmentInputSchema } from "../../src/features/research/contracts";
import { spatialManifestSchema } from "../../src/features/spatial/contracts";
import { participantCodeSchema, studyInputSchema } from "../../src/features/study/contracts";
import { EVENT_TYPE_REGISTRY, telemetryBatchSchema } from "../../src/features/telemetry/contracts";
import { RELATIONSHIP_TYPES } from "../../db/seeds/reference-data";

describe("schema contracts", () => {
  it("validate the seeded relationship-type registry", () => {
    for (const t of RELATIONSHIP_TYPES) expect(relationshipTypeSchema.safeParse(t).success).toBe(true);
    expect(relationshipTypeSchema.safeParse({ ...RELATIONSHIP_TYPES[0], ordered: true }).success).toBe(false);
  });

  it("map every requirement EVT-01..EVT-14 to at least one event type", () => {
    const refs = new Set(EVENT_TYPE_REGISTRY.flatMap((e) => e.requirementRefs as readonly string[]));
    for (let i = 1; i <= 14; i++) expect(refs.has(`EVT-${String(i).padStart(2, "0")}`)).toBe(true);
    // 2D and 3D entry events share one analytic concept.
    const concept = (code: string) => EVENT_TYPE_REGISTRY.find((e) => e.code === code)?.analyticConcept;
    expect(concept("room_entered")).toBe(concept("page_entered"));
  });

  it("enforce the review state machine", () => {
    expect(canTransition("under_review", "verified")).toBe(true);
    expect(canTransition("draft", "published")).toBe(false);
    const base = { entityKind: "concept", entityId: randomUUID(), from: "under_review" } as const;
    expect(verificationTransitionSchema.safeParse({ ...base, to: "needs_evidence" }).success).toBe(false); // needs reason
    expect(verificationTransitionSchema.safeParse({ ...base, to: "needs_evidence", reason: "one weak source" }).success).toBe(true);
  });

  it("apply the demo and key rules to concept input", () => {
    const ok = {
      key: "demo-a.material.m1",
      slug: "demo-a-material-m1",
      type: "material",
      categoryCode: "materials",
      title: "Demo: m1",
      provenanceKind: "unverified",
      isDemo: true,
    };
    expect(conceptInputSchema.safeParse(ok).success).toBe(true);
    expect(conceptInputSchema.safeParse({ ...ok, title: "m1" }).success).toBe(false);
    expect(conceptInputSchema.safeParse({ ...ok, isDemo: false }).success).toBe(false);
    expect(conceptInputSchema.safeParse({ ...ok, key: "demo-a.tool.m1" }).success).toBe(false);
    expect(conceptInputSchema.safeParse({ ...ok, provenanceKind: "hypothesis" }).success).toBe(false);
  });

  it("reject personal data as participant codes and one-sided studies", () => {
    expect(participantCodeSchema.safeParse("P-0001").success).toBe(true);
    expect(participantCodeSchema.safeParse("jane@example.com").success).toBe(false);
    const study = {
      slug: "s1",
      title: "Study",
      protocolVersion: "1",
      design: "between",
      config: {},
      conditions: [
        { code: "a", label: "A", interface: "conventional_2d" },
        { code: "b", label: "B", interface: "conventional_2d" },
      ],
    };
    expect(studyInputSchema.safeParse(study).success).toBe(false);
    expect(
      studyInputSchema.safeParse({ ...study, conditions: [study.conditions[0], { code: "b", label: "B", interface: "immersive_3d" }] }).success,
    ).toBe(true);
  });

  it("require matched content sets for within-subjects studies", () => {
    const conditions = [
      { code: "a", label: "A", interface: "conventional_2d" },
      { code: "b", label: "B", interface: "immersive_3d" },
    ];
    const within = { slug: "w1", title: "Within", protocolVersion: "1", design: "within", conditions };
    expect(studyInputSchema.safeParse({ ...within, config: { traditionSlugs: ["t-a", "t-b"] } }).success).toBe(false);
    expect(
      studyInputSchema.safeParse({
        ...within,
        config: { traditionSlugs: ["t-a", "t-b"], contentSets: { "set-a": { traditionSlugs: ["t-a"] }, "set-b": { traditionSlugs: ["t-b"] } } },
      }).success,
    ).toBe(true);
    expect(studyInputSchema.safeParse({ ...within, design: "between", config: { traditionSlugs: ["t-a"] } }).success).toBe(true);
  });

  it("reject duplicate events within a telemetry batch", () => {
    const sessionId = randomUUID();
    const ev = { eventId: randomUUID(), schemaVersion: 1, sessionId, seq: 1, type: "page_entered", clientTs: new Date().toISOString() };
    const batch = { idempotencyKey: "batch-0001", sessionId, schemaVersion: 1, appBuild: "b", contentVersion: "v1", clientSentAt: new Date().toISOString() };
    expect(telemetryBatchSchema.safeParse({ ...batch, events: [ev] }).success).toBe(true);
    expect(telemetryBatchSchema.safeParse({ ...batch, events: [ev, { ...ev, seq: 2 }] }).success).toBe(false);
    expect(telemetryBatchSchema.safeParse({ ...batch, events: [{ ...ev, metadata: { email: "x" } }] }).success).toBe(false);
  });

  it("validate concept maps, assessments and manifests structurally", () => {
    const map = {
      sessionId: randomUUID(),
      itemId: randomUUID(),
      phase: "post",
      revision: 1,
      isFinal: true,
      nodes: [
        { key: "n1", conceptId: null, label: "A", x: 0, y: 0 },
        { key: "n2", conceptId: null, label: "B", x: 1, y: 1 },
      ],
      edges: [{ key: "e1", source: "n1", target: "n3" }],
    };
    expect(conceptMapSubmissionSchema.safeParse(map).success).toBe(false);
    expect(conceptMapSubmissionSchema.safeParse({ ...map, edges: [{ key: "e1", source: "n1", target: "n2" }] }).success).toBe(true);
    expect(
      assessmentInputSchema.safeParse({ code: "ux", version: 1, kind: "questionnaire", title: "UX", isValidatedInstrument: true }).success,
    ).toBe(false);
    const manifest = {
      schemaVersion: 1,
      snapshotVersion: "v1",
      ruleSet: { id: randomUUID(), name: "r", version: 1, configSha256: "a".repeat(64) },
      compilerVersion: "1.0.0",
      seed: "s",
      elements: [
        { id: "zone-a", kind: "zone", ruleId: "r1" },
        { id: "zone-a", kind: "room", ruleId: "r1", parentId: "zone-a" },
      ],
    };
    expect(spatialManifestSchema.safeParse(manifest).success).toBe(false);
  });
});
