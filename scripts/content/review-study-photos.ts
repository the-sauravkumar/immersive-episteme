/**
 * Reviews the ingested study photographs as a named second curator, through the SAME service the
 * CMS media library uses (`reviewAsset` in src/server/cms/media/service.ts):
 *
 *   npx tsx scripts/content/review-study-photos.ts --as <curator email> --reason "<why>" (--dry-run | --apply)
 *
 * Only the assets whose SHA-256 equals a planned study photograph (every "proposed" entry that
 * scripts/content/ingest-study-photos.ts plans, read from scripts/content/study-photos/) are read or
 * changed. Each asset under review is verified with every media evidence check confirmed and the
 * reason recorded. The service refuses what the CMS refuses: the uploader or an editor of the asset
 * (separation of duties), a missing credit, caption, alt text or provenance, and a file over its
 * licence cap. --dry-run reads only; exit code 1 if any planned photograph is not verified.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CmsError } from "../../src/server/cms/core";
import { assetAuthors, MEDIA_EVIDENCE_CHECKS, reviewAsset } from "../../src/server/cms/media/service";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { arg, assertKnownArgs, flag, REPO_ROOT } from "./_shared";
import { planStudyPhotos } from "./ingest-study-photos";
import { loadActor } from "./verify-concepts";

async function main() {
  assertKnownArgs({ values: ["as", "reason"], flags: ["dry-run", "apply"] });
  const as = arg("as");
  const reason = (arg("reason") ?? "").trim();
  const apply = flag("apply");
  if (flag("dry-run") === apply) throw new Error("give exactly one of --dry-run or --apply");
  if (!as) throw new Error("give --as <curator email>");
  if (reason.length < 3) throw new Error("give --reason (at least 3 characters)");

  const review = join(REPO_ROOT, "content", "review");
  const files = ["media-proposals.json", "process-photo-proposals.json"].map((f) => join(review, f)).filter((f) => existsSync(f));
  const plans = planStudyPhotos(...files.map((f) => JSON.parse(readFileSync(f, "utf8")) as unknown));
  const bySha = new Map(plans.map((p) => [createHash("sha256").update(readFileSync(join(REPO_ROOT, "scripts", "content", "study-photos", p.file))).digest("hex"), p]));

  const { url, label } = resolveDatabaseUrl();
  console.log(`[review-photos] ${label} database ${redact(url)}; ${plans.length} planned photograph(s); mode ${apply ? "APPLY" : "dry run"}`);
  const pool = makePool(url);
  let failed = 0;
  try {
    const actor = await loadActor(pool, as);
    const r = await pool.query<{ id: string; sha256: string; verification_state: string; created_by: string | null; updated_by: string | null }>(
      "SELECT id, sha256, verification_state::text AS verification_state, created_by, updated_by FROM assets WHERE NOT is_demo AND sha256 = ANY($1::text[])",
      [[...bySha.keys()]],
    );
    const found = new Map(r.rows.map((a) => [a.sha256, a]));
    for (const [sha, plan] of bySha) {
      const a = found.get(sha);
      if (!a) {
        failed++;
        console.log(`[review-photos] MISSING ${plan.proposalId}: not in the library (run the ingest first)`);
        continue;
      }
      if (a.verification_state === "verified" || a.verification_state === "published") {
        console.log(`[review-photos] ${plan.proposalId}: already ${a.verification_state} (${a.id})`);
        continue;
      }
      if (!apply) {
        const problems: string[] = [];
        if (a.verification_state !== "under_review") problems.push(`state is ${a.verification_state}`);
        if ((await assetAuthors(pool, a)).has(actor.userId)) problems.push("the reviewer uploaded, edited or linked this asset");
        if (problems.length) failed++;
        console.log(`[review-photos] ${problems.length ? "REFUSED" : "would verify"} ${plan.proposalId} (${a.id})${problems.length ? `: ${problems.join("; ")}` : ""}`);
        continue;
      }
      try {
        await reviewAsset(pool, actor, { assetId: a.id, to: "verified", reason, evidenceChecked: [...MEDIA_EVIDENCE_CHECKS] });
        console.log(`[review-photos] verified ${plan.proposalId} (${a.id})`);
      } catch (e) {
        if (!(e instanceof CmsError)) throw e;
        failed++;
        console.log(`[review-photos] REFUSED ${plan.proposalId} (${a.id}): ${e.code}: ${e.message}`);
      }
    }
  } finally {
    await pool.end();
  }
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[review-photos] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
