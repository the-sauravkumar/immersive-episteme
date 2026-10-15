/**
 * Research-console fixtures: a complete knowledge bundle built from the spatial tests' synthetic
 * demo graph (demo keys and "Demo:" titles, no craft facts), a manifest compiled from it with the
 * default rule set, and a parity input for a study that should pass every critical check.
 */
import { compileSpatialManifest, defaultRuleSetConfig, deterministicUuid, type CompileResult } from "@/features/spatial/compiler";
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import type { ParityInput } from "@/server/research/parity/engine";

import { syntheticGraph, syntheticInput } from "../spatial/fixtures";

export const SOURCE_A = deterministicUuid("source", "demo-source-a");
export const SOURCE_B = deterministicUuid("source", "demo-source-b");

export function demoBundle(): KnowledgeBundle {
  const g = syntheticGraph();
  return {
    schemaVersion: 1,
    versionLabel: g.versionLabel,
    isDemo: true,
    includesUnverified: false,
    generatedAt: "2026-01-01T00:00:00.000Z",
    categories: g.categories.map((c) => ({ ...c })),
    relationshipTypes: g.relationshipTypes.map((t) => ({ ...t, inverseLabel: null })),
    traditions: g.traditions.map((t) => ({
      ...t,
      altNames: [],
      summary: null,
      region: { place: null, district: null, state: null, country: null, lat: null, lon: null },
      gi: null,
      verificationState: "verified" as const,
    })),
    sources: [SOURCE_A, SOURCE_B].map((id, i) => ({
      id,
      kind: "historical_documentation" as const,
      title: `Demo: source ${i + 1}`,
      author: null,
      publisher: null,
      year: null,
      url: null,
      accessedOn: null,
      reliability: null,
      verificationState: "verified" as const,
    })),
    concepts: g.concepts.map((c) => ({
      id: c.id,
      key: c.key,
      slug: c.key.replace(/[._]/g, "-"),
      type: c.type,
      category: c.category,
      traditionId: c.traditionId,
      title: c.title,
      summary: c.summary,
      body: null,
      bodyMd: null,
      localTerms: [],
      compares: [...c.compares],
      provenanceKind: "historical_documentation" as const,
      verificationState: "verified" as const,
      // Every concept cites source A; the shared mechanism alone cites source B.
      claims: [
        {
          id: deterministicUuid("claim", c.key),
          text: `Demo claim about ${c.key}.`,
          quote: null,
          sources: [{ sourceId: c.key.startsWith("demo-shared") ? SOURCE_B : SOURCE_A, locator: null, evidence: [] }],
        },
      ],
      assetIds: [],
    })),
    relationships: g.relationships.map((r) => ({
      ...r,
      explanation: `Demo: explanation of ${r.source} ${r.type} ${r.target}.`,
      conditions: null,
      strength: null,
      provenanceKind: "historical_documentation" as const,
      verificationState: "verified" as const,
      sources: [],
    })),
  };
}

let compiled: CompileResult | null = null;
export function demoManifest(): CompileResult {
  // The manifest is compiled from the bundle itself, as the platform compiles from a snapshot payload.
  compiled ??= compileSpatialManifest(syntheticInput(demoBundle()));
  return compiled;
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** A study configuration that passes every critical parity check. */
export function passingInput(): ParityInput {
  const bundle = demoBundle();
  const m = demoManifest();
  return clone({
    study: {
      id: "00000000-0000-4000-8000-000000000001",
      slug: "parity-fixture",
      protocolVersion: "p1",
      design: "between",
      isDemo: false,
      config: {
        traditionSlugs: ["demo-alpha", "demo-beta"],
        exposure: { mode: "fixed_time", minutes: 20, allowEarlyFinish: false },
        guidance: { policy: "none", cueEnabled: false },
        searchEnabled: false,
      },
      snapshotId: "00000000-0000-4000-8000-0000000000aa",
      manifestId: "00000000-0000-4000-8000-0000000000bb",
      conditions: [
        { id: "c2d", code: "conventional", label: "2D", interface: "conventional_2d", config: {} },
        { id: "c3d", code: "immersive", label: "3D", interface: "immersive_3d", config: {} },
      ],
      battery: [
        { assessmentId: "a-pre", code: "pre-test", version: 1, phase: "pre", position: 0, status: "locked", required: true },
        { assessmentId: "a-post", code: "post-test", version: 1, phase: "post", position: 0, status: "locked", required: true },
      ],
    },
    snapshot: { id: "00000000-0000-4000-8000-0000000000aa", versionLabel: bundle.versionLabel, status: "published", kind: "release", isDemo: false, payload: bundle },
    manifest: {
      id: "00000000-0000-4000-8000-0000000000bb",
      snapshotId: "00000000-0000-4000-8000-0000000000aa",
      status: "published",
      traditions: ["demo-alpha", "demo-beta"],
      manifestHash: m.manifestHash,
      ruleSetConfig: defaultRuleSetConfig(),
      validationPassed: m.validation.passed,
      manifest: m.manifest,
    },
    sessionBudgets: [],
  });
}
