/**
 * Import content/ into the database and build the REVIEW snapshot.
 *
 *   npm run content:import                  -> DATABASE_URL
 *   npm run content:import -- --test        -> TEST_DATABASE_URL
 *   npm run content:import -- --no-snapshot -> import only
 *   npm run content:import -- --content <dir>
 *
 * Read-only on content/. Idempotent (see src/server/content/import-content.ts). Prints the
 * per-table outcome and the review snapshot id, label and payload hash. Exit code 2 when the
 * content has error-level integrity issues (nothing is written).
 */
import { resolve } from "node:path";

import { nodeSha256 } from "../../src/features/knowledge/graph/hash-node";
import { ContentImportRefused, importContent, type TableCounts } from "../../src/server/content/import-content";
import { storeReviewSnapshot } from "../../src/server/content/review-snapshot";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";
import { REPO_ROOT, arg, assertKnownArgs, flag, loadAndValidate } from "./_shared";

assertKnownArgs({ values: ["content"], flags: ["test", "no-snapshot"] });

const fmt = (c: TableCounts) => `+${c.inserted} ~${c.updated} =${c.unchanged}${c.keptAccepted ? ` kept-accepted ${c.keptAccepted}` : ""}${c.keptCurated ? ` kept-curator-state ${c.keptCurated}` : ""}`;

async function main(): Promise<void> {
  const { url, label } = resolveDatabaseUrl();
  const contentDir = resolve(REPO_ROOT, arg("content") ?? "content");
  const { model, report } = loadAndValidate(contentDir);
  console.log(`[content:import] ${label} database ${redact(url)}`);
  console.log(
    `[content:import] ${report.counts.packages} files, ${report.counts.concepts} concepts, ${report.counts.claims} claims, ` +
      `${report.counts.relationships} relationships, ${report.counts.sources} sources; integrity ${JSON.stringify(report.issueCounts)}`,
  );

  const pool = makePool(url);
  const client = await pool.connect();
  try {
    const s = await importContent(client, { model, issues: report.issues, hasher: nodeSha256, invokedBy: "npm run content:import" });
    console.log(`[content:import] packages       ${fmt(s.packages)}`);
    console.log(`[content:import] traditions     ${fmt(s.traditions)}`);
    console.log(`[content:import] sources        ${fmt(s.sources)}`);
    console.log(`[content:import] concepts       ${fmt(s.concepts)}`);
    console.log(`[content:import] claims         ${fmt(s.claims)} (pruned ${s.pruned.claims})`);
    console.log(`[content:import] relationships  ${fmt(s.relationships)} (pruned ${s.pruned.relationships})`);
    console.log(`[content:import] claim sources  +${s.claimSources.inserted} -${s.claimSources.pruned}; relationship sources +${s.relationshipSources.inserted} -${s.relationshipSources.pruned}; GI sources +${s.traditionSources.inserted} -${s.traditionSources.pruned}`);
    console.log(`[content:import] media          ${fmt(s.mediaCandidates)} (pruned ${s.mediaCandidates.pruned})`);
    const stale = s.stale.concepts.length + s.stale.sources.length + s.stale.traditions.length + s.stale.relationships.length;
    if (stale > 0) console.log(`[content:import] stale rows kept (no longer in content/): ${JSON.stringify(s.stale)}`);
    console.log(`[content:import] audit_log ${s.auditLogId}`);

    if (!flag("no-snapshot")) {
      const snap = await storeReviewSnapshot(client, { hasher: nodeSha256 });
      console.log(
        `[content:import] review snapshot ${snap.created ? "created" : "unchanged"}: ${snap.id} ${snap.versionLabel} ` +
          `payload_sha256 ${snap.payloadSha256} (${snap.itemCount} items; draft, kind=review, not publishable)`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  if (err instanceof ContentImportRefused) {
    console.error(`[content:import] refused: ${err.message}`);
    for (const i of err.issues.slice(0, 30)) console.error(`  ${i.code} ${i.message}`);
    process.exit(2);
  }
  console.error("[content:import] failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
