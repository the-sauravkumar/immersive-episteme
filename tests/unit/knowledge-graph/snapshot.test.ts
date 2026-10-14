import { describe, expect, it } from "vitest";

import { knowledgeBundleSchema } from "../../../src/features/knowledge/contracts";
import { nodeSha256 } from "../../../src/features/knowledge/graph/hash-node";
import { bundleToJsonLd } from "../../../src/features/knowledge/graph/jsonld";
import { loadContentFiles } from "../../../src/features/knowledge/graph/loader";
import { buildSnapshot, type BuildSnapshotOptions } from "../../../src/features/knowledge/graph/snapshot";
import type { KnowledgeGraphModel } from "../../../src/features/knowledge/graph/types";
import { validateGraph } from "../../../src/features/knowledge/graph/validate";
import { alphaFile, comparisonsFile, files, load, rel, shuffled } from "./fixtures";

const GENERATED_AT = "2026-10-14T00:00:00.000Z";

function build(model: KnowledgeGraphModel, overrides: Partial<BuildSnapshotOptions> = {}) {
  return buildSnapshot(model, {
    kind: "review",
    hasher: nodeSha256,
    generatedAt: GENERATED_AT,
    issues: validateGraph(model),
    ...overrides,
  });
}

function ok(result: ReturnType<typeof build>) {
  if (!result.ok) throw new Error(result.refusals.map((r) => `${r.code} ${r.message}`).join("; "));
  return result.snapshot;
}

type Json = Record<string, unknown>;

/** Same content, every array that carries no meaning in its order shuffled. */
function shuffledFiles(seed: number): Json[] {
  return shuffled([alphaFile(), comparisonsFile()], seed).map((f, i) => ({
    ...f,
    sources: shuffled(f.sources as Json[], seed + i + 1),
    concepts: shuffled(f.concepts as Json[], seed + i + 2),
    relationships: shuffled(f.relationships as Json[], seed + i + 3),
  }));
}

describe("review snapshot", () => {
  it("builds a schema-valid bundle that is clearly labelled as unverified", () => {
    const s = ok(build(load(alphaFile(), comparisonsFile())));
    expect(s.kind).toBe("review");
    expect(s.notice).toMatch(/REVIEW SNAPSHOT/);
    expect(s.payload.includesUnverified).toBe(true);
    expect(s.payload.isDemo).toBe(false);
    expect(s.versionLabel).toBe(`review-${s.contentSha256.slice(0, 12)}`);
    expect(knowledgeBundleSchema.safeParse(s.payload).success).toBe(true);
    expect(s.verificationCounts.concepts.under_review).toBe(7);
    expect(s.payload.concepts.map((c) => c.key)).toEqual([...s.payload.concepts.map((c) => c.key)].sort());
    expect(s.itemCount).toBe(s.items.length);
    // Qualified source ids in comparisons.json resolve to the tradition's source: one row.
    expect(s.payload.sources).toHaveLength(2);
  });

  it("has an identical content hash and payload for shuffled input", () => {
    const base = ok(build(load(alphaFile(), comparisonsFile())));
    for (const seed of [1, 7, 42, 2026]) {
      const s = ok(build(load(...shuffledFiles(seed))));
      expect(s.contentSha256).toBe(base.contentSha256);
      expect(s.payloadSha256).toBe(base.payloadSha256);
      expect(s.predictedDbPayloadSha256).toBe(base.predictedDbPayloadSha256);
      expect(s.items).toEqual(base.items);
    }
  });

  it("keeps the content hash when only the build time or label changes, and changes it when content does", () => {
    const model = load(alphaFile(), comparisonsFile());
    const a = ok(build(model));
    const b = ok(build(model, { generatedAt: "2027-01-01T00:00:00.000Z", versionLabel: "custom-label" }));
    expect(b.contentSha256).toBe(a.contentSha256);
    expect(b.payloadSha256).not.toBe(a.payloadSha256);

    const changed = alphaFile();
    (changed.relationships as Json[]).push(rel("alpha.tool.tool-b", "BELONGS_TO", "alpha.tradition.alpha"));
    expect(ok(build(load(changed, comparisonsFile()))).contentSha256).not.toBe(a.contentSha256);
  });

  it("refuses to build when there are error-level issues", () => {
    const f = alphaFile();
    (f.relationships as Json[]).push(rel("alpha.process_stage.stage-three", "PRECEDES", "alpha.process_stage.stage-one"));
    const result = build(load(f));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals.map((r) => r.code)).toEqual(["SNAP001"]);
  });

  it("records the source manifest", () => {
    const s = ok(
      build(load(alphaFile()), {
        sourceManifest: { path: "content/review/source-manifest.tsv", sha256: "f".repeat(64), entries: [{ cacheId: "x", httpStatus: 200, sha256: "a".repeat(64), url: "https://example.org/s1" }] },
      }),
    );
    expect(s.sourceManifest!.sources.find((x) => x.ref === "alpha#S1")!.sha256).toBe("a".repeat(64));
    expect(s.sourceManifest!.notArchived).toEqual(["alpha#S2"]);
  });
});

describe("publishable snapshot", () => {
  it("refuses under_review content", () => {
    const result = build(load(alphaFile(), comparisonsFile()), { kind: "publishable" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.refusals.every((r) => r.code === "SNAP002")).toBe(true);
      expect(result.refusals.map((r) => r.message).join(" ")).toMatch(/concepts are not verified/);
    }
  });

  it("refuses if even one item is not accepted", () => {
    const model = load(alphaFile());
    for (const x of [...model.concepts, ...model.relationships, ...model.sources]) x.verificationState = "verified";
    model.relationships[0]!.verificationState = "needs_evidence";
    const result = build(model, { kind: "publishable" });
    expect(result.ok).toBe(false);
  });

  it("builds from fully verified content (curator-accepted, never from interchange files)", () => {
    const model = load(alphaFile());
    for (const x of [...model.concepts, ...model.relationships, ...model.sources]) x.verificationState = "verified";
    const s = ok(build(model, { kind: "publishable" }));
    expect(s.payload.includesUnverified).toBe(false);
    expect(knowledgeBundleSchema.safeParse(s.payload).success).toBe(true);
  });

  it("refuses demo content in a real snapshot", () => {
    const model = load(alphaFile());
    model.concepts[0]!.isDemo = true;
    const result = build(model, { issues: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.refusals.map((r) => r.code)).toContain("SNAP004");
  });
});

describe("JSON-LD export", () => {
  it("emits DefinedTerms with claims, sources and reified relationships", () => {
    const s = ok(build(load(alphaFile(), comparisonsFile())));
    const doc = bundleToJsonLd(s.payload) as { "@graph": Record<string, unknown>[] };
    const terms = doc["@graph"].filter((n) => n["@type"] === "DefinedTerm");
    expect(terms).toHaveLength(s.payload.concepts.length);
    expect(doc["@graph"].filter((n) => n["@type"] === "ie:Relationship")).toHaveLength(s.payload.relationships.length);
    expect(terms.find((t) => t.termCode === "alpha.material.material-a")!.inDefinedTermSet).toEqual({ "@id": "urn:immersive-episteme:tradition:alpha" });
  });
});

describe("loader input order", () => {
  it("produces the same model ordering whatever order files are passed in", () => {
    const a = loadContentFiles(files(alphaFile(), comparisonsFile())).model;
    const b = loadContentFiles(files(comparisonsFile(), alphaFile())).model;
    expect(b).toEqual(a);
  });
});
