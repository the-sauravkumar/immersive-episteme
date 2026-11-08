import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const ACCEPTED = ["verified", "published"];

export interface Listed {
  keys: string[];
  links: string[];
}

export interface VerifyRequest extends Listed {
  evidence: string;
  reason: string;
}

type EntityKind = "concept" | "relationship";

export interface ConceptRow {
  id: string;
  key: string;
  verification_state: string;
  is_demo: boolean;
  tradition_slug: string | null;
  tradition_is_demo: boolean | null;
}

export type Outcome =
  | { key: string; status: "would_verify" | "verified" | "kept"; id: string }
  | { key: string; status: "refused"; id?: string; reasons: string[] };

export interface Deps {
  transition: typeof transition;
  authorsOf: typeof authorsOf;
  citationProblems: typeof citationProblems;
}

const DEFAULT_DEPS: Deps = { transition, authorsOf, citationProblems };

export function parseKeysFile(text: string): Listed {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("keys file is not valid JSON");
  }
  const listed = Array.isArray(raw) ? { keys: raw, links: [] } : raw && typeof raw === "object" ? listedItems(raw as InterchangeFile) : null;
  if (!listed) throw new Error('keys file must be a JSON array of concept keys, { "keys": [...] } or a content/ interchange file');
  if (listed.keys.length + listed.links.length === 0) throw new Error("keys file lists no concepts");
  const bad = listed.keys.filter((k) => typeof k !== "string" || !KEY_RE.test(k));
  if (bad.length) throw new Error(`not concept keys: ${bad.map((b) => JSON.stringify(b)).join(", ")}`);
  return listed as Listed;
}

interface InterchangeFile {
  keys?: unknown;
  concepts?: unknown;
  relationships?: unknown;
}

const verifiedRecords = (list: unknown): Record<string, unknown>[] =>
  Array.isArray(list) ? list.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && item.verification_state === "verified") : [];

export const linkKey = (source: string, type: string, target: string): string => `${source} ${type} ${target}`;

function listedItems(raw: InterchangeFile): { keys: unknown[]; links: string[] } | null {
  if (Array.isArray(raw.keys)) return { keys: raw.keys, links: [] };
  if (!Array.isArray(raw.concepts)) return null;
  return {
    keys: verifiedRecords(raw.concepts).map((c) => c.key),
    links: verifiedRecords(raw.relationships).map((r) => linkKey(String(r.source), String(r.type), String(r.target))),
  };
}

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

export function recordedReason(reason: string, evidence: string): string {
  const r = `${reason.trim()} [evidence: ${evidence.trim()}]`;
  if (reason.trim().length < 3) throw new Error("give --reason (at least 3 characters); it is kept in the review history");
  if (r.length > REASON_MAX) throw new Error(`reason plus evidence link exceeds ${REASON_MAX} characters`);
  return r;
}

async function loadLinks(q: Q, links: readonly string[]): Promise<Map<string, ConceptRow>> {
  if (links.length === 0) return new Map();
  const r = await q.query<ConceptRow>(
    `SELECT r.id, s.key || ' ' || r.type_code || ' ' || t.key AS key, r.verification_state::text AS verification_state, r.is_demo,
            NULL AS tradition_slug, NULL::boolean AS tradition_is_demo
       FROM relationships r JOIN concepts s ON s.id = r.source_concept_id JOIN concepts t ON t.id = r.target_concept_id
      WHERE s.key || ' ' || r.type_code || ' ' || t.key = ANY($1::text[])`,
    [links],
  );
  return new Map(r.rows.map((row) => [row.key, row]));
}

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

function preRefusals(kind: EntityKind, key: string, row: ConceptRow | undefined, seen: Set<string>): string[] {
  const out: string[] = [];
  if (seen.has(key)) out.push("listed more than once");
  if (!row) {
    out.push(`no ${kind} with this key in the database`);
    return out;
  }
  if (row.is_demo) out.push(`demo ${kind}: demo data never enters the review workflow`);
  if (row.tradition_is_demo) out.push(`belongs to a demo tradition (${row.tradition_slug ?? "?"})`);
  return out;
}

export async function runVerification(pool: Pool, actor: Actor, req: VerifyRequest, opts: { apply: boolean; deps?: Deps }): Promise<Outcome[]> {
  const deps = opts.deps ?? DEFAULT_DEPS;
  const reason = recordedReason(req.reason, req.evidence);
  const concepts = await verifyEach(pool, actor, "concept", req.keys, await loadConcepts(pool, req.keys), { reason, apply: opts.apply, deps });
  const links = await verifyEach(pool, actor, "relationship", req.links, await loadLinks(pool, req.links), { reason, apply: opts.apply, deps });
  return [...concepts, ...links];
}

async function verifyEach(
  pool: Pool,
  actor: Actor,
  kind: EntityKind,
  keys: readonly string[],
  rows: Map<string, ConceptRow>,
  { reason, apply, deps }: { reason: string; apply: boolean; deps: Deps },
): Promise<Outcome[]> {
  const seen = new Set<string>();
  const outcomes: Outcome[] = [];
  for (const key of keys) {
    const row = rows.get(key);
    const pre = preRefusals(kind, key, row, seen);
    seen.add(key);
    if (pre.length || !row) {
      outcomes.push({ key, status: "refused", ...(row ? { id: row.id } : {}), reasons: pre });
      continue;
    }
    if (ACCEPTED.includes(row.verification_state)) {
      outcomes.push({ key, status: "kept", id: row.id });
      continue;
    }
    if (!apply) {
      const reasons: string[] = [];
      if (row.verification_state !== "under_review") reasons.push(`state is ${row.verification_state}; only under_review can be verified`);
      if (!canAny(actor, TRANSITION_PERMISSION.verify)) reasons.push("the acting user lacks content.verify");
      if ((await deps.authorsOf(pool, kind, row.id)).has(actor.userId)) reasons.push(`the acting user authored or edited this ${kind} (separation of duties)`);
      for (const p of await deps.citationProblems(pool, kind, row.id)) reasons.push(`${p.code}: ${p.message}`);
      outcomes.push(reasons.length ? { key, status: "refused", id: row.id, reasons } : { key, status: "would_verify", id: row.id });
      continue;
    }
    try {
      await deps.transition(pool, actor, { entityKind: kind, entityId: row.id, to: "verified", reason, evidenceChecked: [...EVIDENCE_CHECK_KEYS] });
      outcomes.push({ key, status: "verified", id: row.id });
    } catch (e) {
      if (!(e instanceof CmsError)) throw e;
      const details = Array.isArray(e.details) ? (e.details as { code?: string; message?: string }[]).map((d) => `${d.code ?? ""}: ${d.message ?? ""}`) : [];
      outcomes.push({ key, status: "refused", id: row.id, reasons: [`${e.code}: ${e.message}`, ...details] });
    }
  }
  return outcomes;
}

export const CONTENT_ACCEPTANCE_REASON =
  "Authorised by the project lead (DR-059, DR-131): the content file records this item as verified, every quote found verbatim at its locator by the mechanical source check";

export function contentFiles(root: string = REPO_ROOT): { keys: string; evidence: string }[] {
  const shared = readdirSync(join(root, "content", "shared")).filter((name) => name.endsWith(".json")).sort();
  const traditions = readdirSync(join(root, "content", "traditions")).sort();
  return [
    ...shared.map((name) => ({ keys: `content/shared/${name}`, evidence: "content/review/shared-verification.md" })),
    ...traditions.map((slug) => ({ keys: `content/traditions/${slug}/tradition.json`, evidence: `content/review/${slug}-verification.md` })),
    { keys: "content/comparisons.json", evidence: "content/review/comparisons-verification.md" },
  ];
}

export async function acceptContentFiles(pool: Pool, email: string, log: (msg: string) => void, root: string = REPO_ROOT): Promise<void> {
  const actor = await loadActor(pool, email);
  const refused: string[] = [];
  for (const file of contentFiles(root)) {
    const listed = parseKeysFile(readFileSync(join(root, file.keys), "utf8"));
    const outcomes = await runVerification(pool, actor, { ...listed, evidence: file.evidence, reason: CONTENT_ACCEPTANCE_REASON }, { apply: true });
    const count = (status: Outcome["status"]) => outcomes.filter((o) => o.status === status).length;
    log(`accepted ${file.keys} as ${email}: ${count("verified")} verified, ${count("kept")} already accepted, ${count("refused")} refused`);
    for (const o of outcomes) if (o.status === "refused") refused.push(`${o.key}: ${o.reasons.join("; ")}`);
  }
  if (refused.length > 0) throw new Error(`${refused.length} verified file record(s) refused by the database:\n${refused.join("\n")}`);
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
  const listed = parseKeysFile(readFileSync(keysPath, "utf8"));
  recordedReason(reason, evidence!);

  const { url, label } = resolveDatabaseUrl();
  console.log(`[verify] ${label} database ${redact(url)}; ${listed.keys.length} listed concept(s), ${listed.links.length} relationship(s); mode ${apply ? "APPLY" : "dry run"}`);
  const pool = makePool(url);
  let refused = 0;
  try {
    const actor = await loadActor(pool, as);
    console.log(`[verify] acting as ${as} (roles: ${actor.roles.join(", ") || "none"})`);
    const outcomes = await runVerification(pool, actor, { ...listed, evidence: evidence!, reason }, { apply });
    for (const o of outcomes) {
      if (o.status === "refused") {
        refused++;
        console.log(`[verify] REFUSED ${o.key}`);
        for (const r of o.reasons) console.log(`           - ${r}`);
      } else if (o.status !== "kept") {
        console.log(`[verify] ${o.status === "verified" ? "verified" : "would verify"} ${o.key}`);
      }
    }
    const kept = outcomes.filter((o) => o.status === "kept").length;
    console.log(`[verify] ${outcomes.length - refused - kept} ${apply ? "verified" : "would be verified"}, ${kept} already accepted, ${refused} refused`);
  } finally {
    await pool.end();
  }
  if (refused > 0) process.exit(1);
}

if (process.argv[1] && /verify-concepts\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("[verify] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
