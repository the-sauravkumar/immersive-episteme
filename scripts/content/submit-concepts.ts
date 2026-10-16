/**
 * Resubmits listed needs_evidence concepts for review (needs_evidence → under_review) through the
 * SAME service the CMS review panel uses (`transition()` in src/server/cms/workflow.ts), as a named
 * staff user, but only when the concept's evidence is now complete:
 *
 *   npx tsx scripts/content/submit-concepts.ts --as <staff email> --keys <keys.json> \
 *     --reason "<why>" (--dry-run | --apply)
 *
 * "Complete" is the verification test itself: `citationProblems()` returns nothing (every claim has
 * a source, a locator, a verbatim quote and its passage), so a resubmitted concept can be verified
 * without an edit. A concept with any citation problem stays needs_evidence and is reported. Only
 * the listed keys are read or changed; demo content is refused (as in verify-concepts.ts). A submit
 * is a workflow move, not an authoring action (`authorsOf` counts only `cms.concept.*` actions), so
 * it does not stop the same curator from verifying later; the reason is kept in the audit log.
 *
 * --dry-run reads only. --apply transitions one concept at a time (each in its own transaction).
 * Exit code 1 if any listed concept was refused.
 */
import { readFileSync } from "node:fs";

import type { Pool } from "pg";

import { CmsError, type Actor } from "../../src/server/cms/core";
import { citationProblems, transition } from "../../src/server/cms/workflow";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { arg, assertKnownArgs, flag } from "./_shared";
import { loadActor, loadConcepts, parseKeysFile } from "./verify-concepts";

export type SubmitOutcome = { key: string; status: "would_submit" | "submitted"; id: string } | { key: string; status: "refused"; id?: string; reasons: string[] };

export async function runSubmit(pool: Pool, actor: Actor, keys: readonly string[], reason: string, opts: { apply: boolean }): Promise<SubmitOutcome[]> {
  const rows = await loadConcepts(pool, keys);
  const seen = new Set<string>();
  const out: SubmitOutcome[] = [];
  for (const key of keys) {
    const row = rows.get(key);
    const reasons: string[] = [];
    if (seen.has(key)) reasons.push("listed more than once");
    seen.add(key);
    if (!row) {
      out.push({ key, status: "refused", reasons: [...reasons, "no concept with this key in the database"] });
      continue;
    }
    if (row.is_demo || row.tradition_is_demo) reasons.push("demo content never enters the review workflow");
    if (row.verification_state !== "needs_evidence") reasons.push(`state is ${row.verification_state}; only needs_evidence is resubmitted`);
    for (const p of await citationProblems(pool, "concept", row.id)) reasons.push(`${p.code}: ${p.message}`);
    if (reasons.length) {
      out.push({ key, status: "refused", id: row.id, reasons });
      continue;
    }
    if (!opts.apply) {
      out.push({ key, status: "would_submit", id: row.id });
      continue;
    }
    try {
      await transition(pool, actor, { entityKind: "concept", entityId: row.id, to: "under_review", reason, evidenceChecked: [] });
      out.push({ key, status: "submitted", id: row.id });
    } catch (e) {
      if (!(e instanceof CmsError)) throw e;
      out.push({ key, status: "refused", id: row.id, reasons: [`${e.code}: ${e.message}`] });
    }
  }
  return out;
}

async function main() {
  assertKnownArgs({ values: ["as", "keys", "reason"], flags: ["dry-run", "apply"] });
  const as = arg("as");
  const keysPath = arg("keys");
  const reason = (arg("reason") ?? "").trim();
  const apply = flag("apply");
  if (flag("dry-run") === apply) throw new Error("give exactly one of --dry-run or --apply");
  if (!as) throw new Error("give --as <staff email>");
  if (!keysPath) throw new Error("give --keys <file.json>");
  if (reason.length < 3) throw new Error("give --reason (at least 3 characters)");
  const keys = parseKeysFile(readFileSync(keysPath, "utf8"));
  const { url, label } = resolveDatabaseUrl();
  console.log(`[submit] ${label} database ${redact(url)}; ${keys.length} listed concept(s); mode ${apply ? "APPLY" : "dry run"}`);
  const pool = makePool(url);
  let refused = 0;
  try {
    const actor = await loadActor(pool, as);
    for (const o of await runSubmit(pool, actor, keys, reason, { apply })) {
      if (o.status === "refused") {
        refused++;
        console.log(`[submit] REFUSED ${o.key}`);
        for (const r of o.reasons) console.log(`           - ${r}`);
      } else console.log(`[submit] ${o.status === "submitted" ? "submitted" : "would submit"} ${o.key}`);
    }
    console.log(`[submit] ${keys.length - refused} ${apply ? "submitted" : "would be submitted"}, ${refused} refused`);
  } finally {
    await pool.end();
  }
  if (refused > 0) process.exit(1);
}

if (process.argv[1] && /submit-concepts\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("[submit] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
