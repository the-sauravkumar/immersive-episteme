/**
 * Compile a spatial manifest from a STORED snapshot and persist it (spatial_manifests +
 * element index). Unlike scripts/spatial/compile-content.ts (files only, no database), the
 * manifest ids here are the database ids, so a study can pin it.
 *
 *   npm run spatial:compile -- [--snapshot <id> | --label <version label>] [--traditions a,b,c]
 *                              [--seed s] [--test]
 *
 * Defaults: the newest real review snapshot; traditions ajrakh,sanganeri,machilipatnam-kalamkari;
 * seed "default". Idempotent: the same inputs return the existing manifest. Exit code 1 when the
 * compiler's validation fails (the manifest is still stored, with status `invalid`).
 *
 * "publish" here means persist: the stored manifest is `valid`/`invalid`, not `published`.
 * Publishing (immutable, needs a published snapshot and a frozen rule set) is a curated step.
 */
import { latestReviewSnapshotId } from "../../src/server/knowledge/snapshot-store";
import { compileAndStoreManifest } from "../../src/server/spatial/manifest-store";
import { arg, assertKnownArgs } from "../content/_shared";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";

assertKnownArgs({ values: ["snapshot", "label", "traditions", "seed"], flags: ["test"] });

const DEFAULT_TRADITIONS = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"] as const;

async function main(): Promise<void> {
  const { url, label } = resolveDatabaseUrl();
  const pool = makePool(url);
  const client = await pool.connect();
  try {
    let snapshotId = arg("snapshot") ?? null;
    if (!snapshotId && arg("label")) {
      const r = await client.query<{ id: string }>("SELECT id FROM content_snapshots WHERE version_label = $1", [arg("label")]);
      snapshotId = r.rows[0]?.id ?? null;
    }
    snapshotId ??= await latestReviewSnapshotId(client);
    if (!snapshotId) throw new Error("No snapshot found. Run `npm run content:import` first.");
    const traditions = (arg("traditions") ?? DEFAULT_TRADITIONS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
    console.log(`[spatial:compile] ${label} database ${redact(url)}; snapshot ${snapshotId}; traditions ${traditions.join(", ")}`);
    const m = await compileAndStoreManifest(client, { snapshotId, traditions, seed: arg("seed") ?? "default" });
    console.log(
      `[spatial:compile] manifest ${m.created ? "created" : "unchanged"}: ${m.id} status ${m.status} ` +
        `manifest_hash ${m.manifestHash} compiler_hash ${m.compilerManifestHash} (${m.compilerVersion}, seed ${m.seed}, ${m.elements} elements, ${m.encodings} encodings)`,
    );
    process.exitCode = m.validationPassed ? 0 : 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[spatial:compile] failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exit(1);
});
