/**
 * Shared fixture for the immersive tests: the curated content/ built into a review snapshot
 * bundle (the same path the database import takes), a manifest compiled from that SAME bundle
 * (so concept ids agree, as they do for a stored manifest and its snapshot), and the read view.
 */
import { join } from "node:path";

import { compileSpatialManifest, DEFAULT_RULE_SET, defaultRuleSetConfig, ruleSetUuid, type CompilerGraph } from "@/features/spatial/compiler";
import type { KnowledgeBundle } from "@/features/knowledge/contracts";
import { nodeSha256 } from "@/features/knowledge/graph/hash-node";
import { readContentDirectory } from "@/features/knowledge/graph/load-content-dir";
import { validateContentFiles } from "@/features/knowledge/graph/report";
import { buildSnapshot } from "@/features/knowledge/graph/snapshot";
import { parseSourceManifest } from "@/features/knowledge/graph/source-manifest";
import { createKnowledgeView } from "@/features/knowledge/read/view";

export const TRADITIONS = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];

let cached: { bundle: KnowledgeBundle; manifest: ReturnType<typeof compileSpatialManifest>; view: ReturnType<typeof createKnowledgeView> } | null = null;

export function museumFixture() {
  if (cached) return cached;
  const root = process.cwd();
  const dir = readContentDirectory(join(root, "content"), root);
  const sm = dir.sourceManifest ? parseSourceManifest(dir.sourceManifest.text) : null;
  const { model, report } = validateContentFiles(dir.files, { sourceManifest: sm });
  const built = buildSnapshot(model, { hasher: nodeSha256, generatedAt: "2026-10-14T00:00:00.000Z", issues: report.issues, kind: "review" });
  if (!built.ok) throw new Error("review snapshot did not build");
  const bundle = built.snapshot.payload as KnowledgeBundle;
  const graph = bundle as unknown as CompilerGraph;
  const manifest = compileSpatialManifest({
    graph,
    snapshotVersion: graph.versionLabel,
    traditions: TRADITIONS,
    ruleSet: { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config: defaultRuleSetConfig() },
    seed: "default",
  });
  cached = { bundle, manifest, view: createKnowledgeView(bundle) };
  return cached;
}
