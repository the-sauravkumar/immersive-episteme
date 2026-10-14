/**
 * Validate the curated content/ graph and write an integrity report.
 *
 *   npx tsx scripts/content/validate.ts [--content content] [--out analysis/out/knowledge-graph]
 *
 * Writes integrity-report.json (machine-readable) and integrity-report.md. Exit code 1 when
 * there are error-level issues. Never writes to content/.
 */
import { resolve } from "node:path";

import { renderIntegrityMarkdown } from "../../src/features/knowledge/graph/report";
import { DEFAULT_OUT, REPO_ROOT, arg, assertKnownArgs, loadAndValidate, writeOut } from "./_shared";

assertKnownArgs({ values: ["content", "out"] });

const contentDir = resolve(REPO_ROOT, arg("content") ?? "content");
const outDir = resolve(REPO_ROOT, arg("out") ?? DEFAULT_OUT);

const { report } = loadAndValidate(contentDir);
const json = writeOut(outDir, "integrity-report.json", JSON.stringify(report, null, 2));
const md = writeOut(outDir, "integrity-report.md", renderIntegrityMarkdown(report));

const c = report.counts;
console.log(`Validated ${c.packages} files: ${c.concepts} concepts, ${c.claims} claims, ${c.relationships} relationships, ${c.sources} sources`);
console.log(`Issues: ${report.issueCounts.error} error, ${report.issueCounts.warning} warning, ${report.issueCounts.info} info`);
for (const [code, n] of Object.entries(report.byCode)) console.log(`  ${code}: ${n}`);
for (const e of report.issues.filter((i) => i.severity === "error")) console.log(`ERROR ${e.code} ${e.message}`);
console.log(`Wrote ${json}\nWrote ${md}`);
process.exitCode = report.ok ? 0 : 1;
