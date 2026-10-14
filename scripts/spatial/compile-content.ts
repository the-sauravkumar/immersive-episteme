/**
 * Compile the curated content/ files into a spatial manifest, without a database.
 *
 *   npx tsx scripts/spatial/compile-content.ts [--traditions a,b,c] [--seed s] [--out dir]
 *                                              [--snapshot-version label]
 *
 * Defaults: traditions ajrakh,sanganeri,machilipatnam-kalamkari; seed "default";
 * out analysis/out/spatial/<traditions>/ (gitignored: /analysis/out/).
 * Writes manifest.json (canonical JSON; its sha256 is the manifest hash) and
 * validation.json, then prints a summary. Exit code 1 when validation fails.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KNOWLEDGE_CATEGORIES, RELATIONSHIP_TYPES } from "../../db/seeds/reference-data";
import {
  canonicalJson,
  compileSpatialManifest,
  contentToGraph,
  DEFAULT_RULE_SET,
  defaultRuleSetConfig,
  ruleSetUuid,
  sha256Hex,
} from "../../src/features/spatial/compiler";
import { assertKnownArgs } from "../content/_shared";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

assertKnownArgs({ values: ["traditions", "seed", "out", "snapshot-version"] });

const traditions = (arg("traditions") ?? "ajrakh,sanganeri,machilipatnam-kalamkari").split(",").map((s) => s.trim()).filter(Boolean);
const seed = arg("seed") ?? "default";
const outDir = path.resolve(ROOT, arg("out") ?? path.join("analysis", "out", "spatial", traditions.join("+")));

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, "utf8"));
const traditionDir = path.join(ROOT, "content", "traditions");
// All tradition files are loaded (comparisons and shared science reference them); the
// compiler selects the requested traditions.
const traditionFiles = readdirSync(traditionDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
  .map((slug) => readJson(path.join(traditionDir, slug, "tradition.json")));
const sharedDir = path.join(ROOT, "content", "shared");
const sharedFiles = [
  ...readdirSync(sharedDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson(path.join(sharedDir, f))),
  readJson(path.join(ROOT, "content", "comparisons.json")),
];

const adapted = contentToGraph(
  { traditions: traditionFiles, shared: sharedFiles },
  {
    categories: KNOWLEDGE_CATEGORIES.map((c, i) => ({ code: c.code, label: c.label, templateGroup: c.templateGroup, position: i + 1 })),
    relationshipTypes: RELATIONSHIP_TYPES.map((t) => ({
      code: t.code,
      label: t.label,
      semantics: t.semantics,
      directed: t.directed,
      ordered: t.ordered,
      allowsCycles: t.allowsCycles,
    })),
  },
  arg("snapshot-version"),
);
if (adapted.problems.length) {
  console.error("Content files failed validation:\n" + adapted.problems.join("\n"));
  process.exit(2);
}

const config = defaultRuleSetConfig();
const result = compileSpatialManifest({
  graph: adapted.graph,
  snapshotVersion: adapted.graph.versionLabel,
  traditions,
  ruleSet: { id: ruleSetUuid(DEFAULT_RULE_SET.name, DEFAULT_RULE_SET.version), name: DEFAULT_RULE_SET.name, version: DEFAULT_RULE_SET.version, config },
  seed,
  assets: adapted.assets,
});

mkdirSync(outDir, { recursive: true });
const manifestText = canonicalJson(result.manifest);
writeFileSync(path.join(outDir, "manifest.json"), manifestText);
writeFileSync(path.join(outDir, "validation.json"), JSON.stringify({ manifestHash: result.manifestHash, ...result.validation }, null, 2));

const count = (k: string) => result.manifest.elements.filter((e) => e.kind === k).length;
const rooms = result.manifest.elements.filter((e) => e.kind === "room");
console.log(`Spatial compiler ${result.manifest.compilerVersion} (${result.manifest.layoutVersion})`);
console.log(`snapshot  ${result.manifest.snapshotVersion}   seed ${seed}   traditions ${traditions.join(", ")}`);
console.log(
  `zones ${count("zone")}  rooms ${rooms.length}  exhibits ${count("exhibit")}  stations ${count("station")}  portals ${count("portal")}  paths ${count("path")}  cues ${count("cue")}  labels ${count("label")}`,
);
const c = result.validation.coverage;
console.log(`coverage  concepts ${c.concepts.placed}/${c.concepts.total}   relationships ${c.relationships.encoded}/${c.relationships.total}`);
for (const ch of result.validation.checks) {
  const d = ch.details;
  const flag = ch.passed ? (d && d.issues.length > 0 ? "WARN" : "ok  ") : "FAIL";
  console.log(`  ${flag} ${ch.id}${d && d.issues.length ? ` (${d.issues.length}): ${d.issues[0]}` : ""}`);
}
console.log(`validation ${result.validation.passed ? "PASSED" : "FAILED"}`);
console.log(`manifest  ${path.relative(ROOT, path.join(outDir, "manifest.json"))} (${manifestText.length} bytes)`);
console.log(`hash      sha256:${result.manifestHash}`);
if (sha256Hex(manifestText) !== result.manifestHash) {
  console.error("Hash of the written file differs from the manifest hash");
  process.exit(3);
}
process.exit(result.validation.passed ? 0 : 1);
