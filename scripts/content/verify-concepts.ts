/**
 * Verifies a listed set of concepts through the SAME service the CMS review panel uses
 * (`transition()` in src/server/cms/workflow.ts), as a named staff user:
 *
 *   npx tsx scripts/content/verify-concepts.ts --as <staff email> --keys <keys.json> \
 *     --evidence <https URL or repo path> --reason "<why>" (--dry-run | --apply) [--test]
 *
 * <keys.json> is a JSON array of concept keys, or { "keys": [...] }. Only those concepts are read
 * or changed; nothing else is touched. For each listed key it moves under_review → verified with
 * all four evidence checks confirmed and the reason (plus the evidence link) recorded, so the
 * verification_records trigger and the audit log carry the actor, the reason and the checklist
 * exactly as a verification in the CMS does. Everything the CMS refuses is refused here too
 * (permission, separation of duties, incomplete citations, wrong state), because the service
 * decides, not this script.
 *
 * It additionally refuses, before calling the service:
 *  - demo content (the concept or its tradition has is_demo; demo data never enters a study);
 *  - keys that are not in the database, or listed twice.
 *
 * --dry-run reads only: it reports, per key, "would verify" or every reason it would be refused
 * (state, demo, permission, self-verification, citation problems). --apply performs the
 * transitions one concept at a time (each in its own transaction, as in the CMS) and reports
 * every refusal; the exit code is 1 if any listed concept was not verified.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

import type { Pool } from "pg";

import { canAny } from "../../src/lib/permissions/can";
import type { StaffRole } from "../../src/lib/permissions/roles";
import { CmsError, type Actor, type Q } from "../../src/server/cms/core";
import { EVIDENCE_CHECK_KEYS } from "../../src/server/cms/schemas";
import { authorsOf, citationProblems, transition, TRANSITION_PERMISSION } from "../../src/server/cms/workflow";
import { makePool, redact, resolveDatabaseUrl } from "../db/_shared";

import { arg, assertKnownArgs, flag, REPO_ROOT } from "./_shared";

const REASON_MAX = 2000;
const KEY_RE = /^[a-z0-9][a-z0-9-]*\.[a-z_]+\.[a-z0-9][a-z0-9-]*$/;

export interface VerifyRequest {
  keys: string[];
  evidence: string;
  reason: string;
}

export interface ConceptRow {
  id: string;
  key: string;
  verification_state: string;
  is_demo: boolean;
  tradition_slug: string | null;
  tradition_is_demo: boolean | null;
}

export type Outcome =
  | { key: string; status: "would_verify" | "verified"; id: string }
  | { key: string; status: "refused"; id?: string; reasons: string[] };

export interface Deps {
  transition: typeof transition;
  authorsOf: typeof authorsOf;
  citationProblems: typeof citationProblems;
}

const DEFAULT_DEPS: Deps = { transition, authorsOf, citationProblems };

/** Parses the keys file: a JSON array of strings or { keys: [...] }. Throws on anything else. */
export function parseKeysFile(text: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("keys file is not valid JSON");
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { keys?: unknown }).keys) ? (raw as { keys: unknown[] }).keys : null;
  if (!list) throw new Error('keys file must be a JSON array of concept keys or { "keys": [...] }');
  if (list.length === 0) throw new Error("keys file lists no concepts");
  const bad = list.filter((k) => typeof k !== "string" || !KEY_RE.test(k));
  if (bad.length) throw new Error(`not concept keys: ${bad.map((b) => JSON.stringify(b)).join(", ")}`);
  return list as string[];
}

/** The evidence link must be an https URL or an existing file inside the repository. */
export function evidenceProblem(evidence: string | undefined, repoRoot: string = REPO_ROOT): string | null {
  if (!evidence || !evidence.trim()) return "give --evidence (an https URL or a repository path to the verification record)";
  const e = evidence.trim();
  if (/^https:\/\/\S+$/.test(e)) return null;
  if (/^[a-z]+:/i.test(e) || isAbsolute(e)) return "evidence must be an https URL or a repository-relative path";
  const n = normalize(e);
  if (n.startsWith("..")) return "evidence path must stay inside the repository";
  if (!existsSync(join(repoRoot, n))) return `evidence path not found in the repository: ${e}`;
  return null;
}

/** The reason recorded with each verification: the given reason plus the evidence link. */
export function recordedReason(reason: string, evidence: string): string {
  const r = `${reason.trim()} [evidence: ${evidence.trim()}]`;
  if (reason.trim().length < 3) throw new Error("give --reason (at least 3 characters); it is kept in the review history");
  if (r.length > REASON_MAX) throw new Error(`reason plus evidence link exceeds ${REASON_MAX} characters`);
  return r;
}

/** Loads exactly the listed concepts (by key), with their tradition's demo flag. */
export async function loadConcepts(q: Q, keys: readonly string[]): Promise<Map<string, ConceptRow>> {
  const r = await q.query<ConceptRow>(
    `SELECT c.id, c.key, c.verification_state::text AS verification_state, c.is_demo,
            t.slug AS tradition_slug, t.is_demo AS tradition_is_demo
       FROM concepts c LEFT JOIN traditions t ON t.id = c.tradition_id
      WHERE c.key = ANY($1::text[])`,
    [keys],
  );
  return new Map(r.rows.map((row) => [row.key, row]));
}

/** Refusals that do not need the service: unknown, duplicate, demo. */
function preRefusals(key: string, row: ConceptRow | undefined, seen: Set<string>): string[] {
  const out: string[] = [];
  if (seen.has(key)) out.push("listed more than once");
  if (!row) {
    out.push("no concept with this key in the database");
    return out;
  }
  if (row.is_demo) out.push("demo concept: demo data never enters the review workflow");
  if (row.tradition_is_demo) out.push(`belongs to a demo tradition (${row.tradition_slug ?? "?"})`);
  return out;
}

/**
 * Plans (dry run) or applies the verifications. Only concepts whose key is in `req.keys` are
 * read or changed; each goes through `deps.transition` in its own transaction.
 */
export async function runVerification(pool: Pool, actor: Actor, req: VerifyRequest, opts: { apply: boolean; deps?: Deps }): Promise<Outcome[]> {
  const deps = opts.deps ?? DEFAULT_DEPS;
  const reason = recordedReason(req.reason, req.evidence);
  const rows = await loadConcepts(pool, req.keys);
  const seen = new Set<string>();
  const outcomes: Outcome[] = [];
  for (const key of req.keys) {
    const row = rows.get(key);
    const pre = preRefusals(key, row, seen);
    seen.add(key);
    if (pre.length || !row) {
      outcomes.push({ key, status: "refused", ...(row ? { id: row.id } : {}), reasons: pre });
      continue;
    }
    if (!opts.apply) {
      const reasons: string[] = [];
      if (row.verification_state !== "under_review") reasons.push(`state is ${row.verification_state}; only under_review can be verified`);
      if (!canAny(actor, TRANSITION_PERMISSION.verify)) reasons.push("the acting user lacks content.verify");
      if ((await deps.authorsOf(pool, "concept", row.id)).has(actor.userId)) reasons.push("the acting user authored or edited this concept (separation of duties)");
      for (const p of await deps.citationProblems(pool, "concept", row.id)) reasons.push(`${p.code}: ${p.message}`);
      outcomes.push(reasons.length ? { key, status: "refused", id: row.id, reasons } : { key, status: "would_verify", id: row.id });
      continue;
    }
    try {
      await deps.transition(pool, actor, { entityKind: "concept", entityId: row.id, to: "verified", reason, evidenceChecked: [...EVIDENCE_CHECK_KEYS] });
      outcomes.push({ key, status: "verified", id: row.id });
    } catch (e) {
      if (!(e instanceof CmsError)) throw e;
      const details = Array.isArray(e.details) ? (e.details as { code?: string; message?: string }[]).map((d) => `${d.code ?? ""}: ${d.message ?? ""}`) : [];
      outcomes.push({ key, status: "refused", id: row.id, reasons: [`${e.code}: ${e.message}`, ...details] });
    }
  }
  return outcomes;
}

export async function loadActor(q: Q, email: string): Promise<Actor> {
  const u = await q.query<{ id: string; roles: StaffRole[] }>(
    "SELECT u.id, coalesce(array_agg(r.role::text) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles FROM users u LEFT JOIN user_roles r ON r.user_id = u.id WHERE lower(u.email) = lower($1) GROUP BY u.id",
    [email],
  );
  if (!u.rows[0]) throw new Error(`No account for ${email}`);
  return { userId: u.rows[0].id, roles: u.rows[0].roles };
}

async function main() {
  assertKnownArgs({ values: ["as", "keys", "evidence", "reason"], flags: ["dry-run", "apply", "test"] });
  const as = arg("as");
  const keysPath = arg("keys");
  const evidence = arg("evidence");
  const reason = arg("reason") ?? "";
  const dryRun = flag("dry-run");
  const apply = flag("apply");
  if (dryRun === apply) throw new Error("give exactly one of --dry-run or --apply");
  if (!as) throw new Error("give --as <staff email> (the verifying curator)");
  if (!keysPath) throw new Error("give --keys <file.json> (a JSON array of concept keys)");
  const ev = evidenceProblem(evidence);
  if (ev) throw new Error(ev);
  const keys = parseKeysFile(readFileSync(keysPath, "utf8"));
  recordedReason(reason, evidence!);

  const { url, label } = resolveDatabaseUrl();
  console.log(`[verify] ${label} database ${redact(url)}; ${keys.length} listed concept(s); mode ${apply ? "APPLY" : "dry run"}`);
  const pool = makePool(url);
  let refused = 0;
  try {
    const actor = await loadActor(pool, as);
    console.log(`[verify] acting as ${as} (roles: ${actor.roles.join(", ") || "none"})`);
    const outcomes = await runVerification(pool, actor, { keys, evidence: evidence!, reason }, { apply });
    for (const o of outcomes) {
      if (o.status === "refused") {
        refused++;
        console.log(`[verify] REFUSED ${o.key}`);
        for (const r of o.reasons) console.log(`           - ${r}`);
      } else {
        console.log(`[verify] ${o.status === "verified" ? "verified" : "would verify"} ${o.key}`);
      }
    }
    console.log(`[verify] ${outcomes.length - refused} ${apply ? "verified" : "would be verified"}, ${refused} refused`);
  } finally {
    await pool.end();
  }
  if (refused > 0) process.exit(1);
}

// Run only as a script (the unit tests import the helpers).
if (process.argv[1] && /verify-concepts\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("[verify] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
