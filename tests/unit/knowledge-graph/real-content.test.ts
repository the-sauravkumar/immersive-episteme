/**
 * Runs the validator and the review-snapshot builder over the curated content/ (read-only).
 * The curated data is real and source-cited but unverified: it must have zero error-level
 * issues, must build a review snapshot, and must never build a publishable one.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { knowledgeBundleSchema } from "../../../src/features/knowledge/contracts";
import { nodeSha256 } from "../../../src/features/knowledge/graph/hash-node";
import { readContentDirectory } from "../../../src/features/knowledge/graph/load-content-dir";
import { validateContentFiles } from "../../../src/features/knowledge/graph/report";
import { buildSnapshot } from "../../../src/features/knowledge/graph/snapshot";
import { parseSourceManifest } from "../../../src/features/knowledge/graph/source-manifest";

const CONTENT = join(process.cwd(), "content");
const present = existsSync(join(CONTENT, "traditions"));

describe.skipIf(!present)("curated content/", () => {
  const dir = present ? readContentDirectory(CONTENT, process.cwd()) : null;
  const manifest = dir?.sourceManifest ? parseSourceManifest(dir.sourceManifest.text) : null;
  const { model, report } = dir ? validateContentFiles(dir.files, { sourceManifest: manifest }) : ({} as ReturnType<typeof validateContentFiles>);

  it("has zero error-level integrity issues", () => {
    const errors = report.issues.filter((i) => i.severity === "error").map((i) => `${i.code} ${i.message}`);
    expect(errors).toEqual([]);
    expect(report.counts.concepts).toBeGreaterThan(0);
  });

  it("is real, unverified content: never demo, never verified or published", () => {
    const states = new Set([...model.concepts, ...model.relationships].map((x) => x.verificationState));
    expect([...states].every((s) => s === "under_review" || s === "needs_evidence")).toBe(true);
    expect(model.concepts.some((c) => c.isDemo)).toBe(false);
  });

  it("builds a review snapshot and refuses a publishable one", () => {
    const opts = { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z", issues: report.issues };
    const review = buildSnapshot(model, { ...opts, kind: "review" });
    expect(review.ok).toBe(true);
    if (review.ok) {
      expect(review.snapshot.payload.includesUnverified).toBe(true);
      expect(review.snapshot.payload.isDemo).toBe(false);
      expect(knowledgeBundleSchema.safeParse(review.snapshot.payload).success).toBe(true);
    }
    const publishable = buildSnapshot(model, { ...opts, kind: "publishable" });
    expect(publishable.ok).toBe(false);
  });
});
