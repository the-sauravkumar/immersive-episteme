/**
 * Build a knowledge-bundle snapshot from content/.
 *
 *   npx tsx scripts/content/build-snapshot.ts [--kind review|publishable] [--label <versionLabel>]
 *       [--generated-at <ISO 8601>] [--out analysis/out/knowledge-graph] [--no-jsonld]
 *
 * `review` (default) builds a clearly labelled researcher snapshot that includes unverified
 * content. `publishable` is refused unless every item is verified/published and the graph has
 * no error-level issues; content/ can never satisfy that, by design (FORMAT.md).
 * Writes snapshot-<label>.json (envelope + payload) and snapshot-<label>.jsonld.
 * Exit code 2 when the build is refused. Never writes to content/.
 */
import { resolve } from "node:path";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { bundleToJsonLd } from "../../src/features/knowledge/graph/jsonld";
import { buildSnapshot, type SnapshotKind } from "../../src/features/knowledge/graph/snapshot";
import { DEFAULT_OUT, REPO_ROOT, arg, assertKnownArgs, flag, loadAndValidate, writeOut } from "./_shared";

assertKnownArgs({ values: ["kind", "content", "out", "generated-at", "label"], flags: ["no-jsonld"] });

const kind = (arg("kind") ?? "review") as SnapshotKind;
if (kind !== "review" && kind !== "publishable") {
  console.error(`--kind must be review or publishable (got ${kind})`);
  process.exit(64);
}
const contentDir = resolve(REPO_ROOT, arg("content") ?? "content");
const outDir = resolve(REPO_ROOT, arg("out") ?? DEFAULT_OUT);
const generatedAt = arg("generated-at") ?? new Date().toISOString();

const { dir, model, report, manifestEntries } = loadAndValidate(contentDir);
const result = buildSnapshot(model, {
  kind,
  hasher: nodeSha256,
  generatedAt,
  issues: report.issues,
  versionLabel: arg("label"),
  sourceManifest: dir.sourceManifest && manifestEntries ? { path: dir.sourceManifest.path, sha256: dir.sourceManifest.sha256, entries: manifestEntries } : null,
});

if (!result.ok) {
  console.error(`Refused to build a ${result.kind} snapshot:`);
  for (const r of result.refusals) console.error(`  ${r.code} ${r.message}`);
  process.exit(2);
}

const s = result.snapshot;
const file = writeOut(outDir, `snapshot-${s.versionLabel}.json`, JSON.stringify(s, null, 2));
console.log(s.notice);
console.log(`versionLabel          ${s.versionLabel}`);
console.log(`contentSha256         ${s.contentSha256}`);
console.log(`payloadSha256         ${s.payloadSha256}`);
console.log(`predictedDbPayloadSha ${s.predictedDbPayloadSha256}`);
console.log(`items                 ${s.itemCount}`);
console.log(`concept states        ${JSON.stringify(Object.fromEntries(Object.entries(s.verificationCounts.concepts).filter(([, n]) => n > 0)))}`);
console.log(`relationship states   ${JSON.stringify(Object.fromEntries(Object.entries(s.verificationCounts.relationships).filter(([, n]) => n > 0)))}`);
console.log(`integrity             ${JSON.stringify(s.integrity)}`);
if (s.sourceManifest) console.log(`source manifest       ${s.sourceManifest.sha256} (${s.sourceManifest.entries} entries, ${s.sourceManifest.notArchived.length} cited URLs not archived)`);
console.log(`Wrote ${file}`);
if (!flag("no-jsonld")) {
  console.log(`Wrote ${writeOut(outDir, `snapshot-${s.versionLabel}.jsonld`, JSON.stringify(bundleToJsonLd(s.payload), null, 2))}`);
}
