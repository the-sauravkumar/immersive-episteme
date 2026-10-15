/**
 * Review and publishing workflow for traditions, concepts, relationships and sources.
 *
 *   draft ──submit──▶ under_review ──verify──▶ verified ──release──▶ published
 *                        │  ▲                     │                    │
 *              needs_evidence / rejected     reopen / archive    reopen / archive
 *
 * Who may do what (src/lib/permissions/matrix.ts):
 *  - submit (draft|needs_evidence → under_review), withdraw (under_review → draft),
 *    restore (rejected|archived → draft): content.draft / content.edit (editors, curators);
 *  - verify (under_review → verified): content.verify (curators, PI) — never one's own work
 *    (separation of duties), with an evidence checklist and a complete citation for every claim;
 *  - needs_evidence / rejected / reopen (verified|published → under_review): content.review,
 *    with a reason;
 *  - archive (→ archived): content.verify, with a reason;
 *  - published: never set by hand; only a RELEASE publication (./release.ts) moves verified
 *    content to published, together with the immutable snapshot that contains it.
 * State changes run in an actor transaction, so verification_records (trigger) gets the actor
 * and reason; an audit_log row adds the evidence checklist.
 */
import type { Pool } from "pg";

import { canTransition } from "@/features/knowledge/contracts";
import { canAny } from "@/lib/permissions/can";
import type { Permission } from "@/lib/permissions/permissions";
import type { VerificationState } from "@/lib/validation/enums";

import { edgeIssues } from "./graph";
import { audit, CmsError, ensure, inActorTx, type Actor, type Q } from "./core";
import { EVIDENCE_CHECK_KEYS, EVIDENCE_CHECKS, type CmsEntityKind, type TransitionInput } from "./schemas";

const TABLE: Record<CmsEntityKind, string> = {
  tradition: "traditions",
  concept: "concepts",
  relationship: "relationships",
  source: "sources",
};

/** Actions on an entity that count as authoring it (review decisions do not). */
const AUTHORING_ACTIONS: Record<CmsEntityKind, string> = {
  tradition: "cms.tradition.",
  concept: "cms.concept.",
  relationship: "cms.relationship.",
  source: "cms.source.",
};
/** Curator notes are editorial, not learner content: editing them does not make you an author. */
const NON_AUTHORING = ["cms.concept.notes_saved"];

export type TransitionKind = "submit" | "withdraw" | "restore" | "verify" | "needs_evidence" | "reject" | "reopen" | "archive";

export function classifyTransition(from: VerificationState, to: VerificationState): TransitionKind | null {
  if (to === "under_review" && (from === "draft" || from === "needs_evidence")) return "submit";
  if (to === "draft" && from === "under_review") return "withdraw";
  if (to === "draft" && (from === "rejected" || from === "archived")) return "restore";
  if (to === "verified" && from === "under_review") return "verify";
  if (to === "needs_evidence") return "needs_evidence";
  if (to === "rejected") return "reject";
  if (to === "under_review" && (from === "verified" || from === "published")) return "reopen";
  if (to === "archived") return "archive";
  return null;
}

export const TRANSITION_PERMISSION: Record<TransitionKind, readonly Permission[]> = {
  submit: ["content.draft", "content.edit"],
  withdraw: ["content.draft", "content.edit"],
  restore: ["content.edit"],
  verify: ["content.verify"],
  needs_evidence: ["content.review"],
  reject: ["content.review"],
  reopen: ["content.review"],
  archive: ["content.verify"],
};

const REASON_REQUIRED: readonly TransitionKind[] = ["verify", "needs_evidence", "reject", "reopen", "archive"];

/** Users who authored the entity: created/last updated it, or ran an authoring CMS action on it. */
export async function authorsOf(q: Q, kind: CmsEntityKind, id: string): Promise<Set<string>> {
  const table = TABLE[kind];
  const row = await q.query<{ created_by: string | null; updated_by: string | null }>(`SELECT created_by, updated_by FROM ${table} WHERE id = $1`, [id]);
  const out = new Set<string>();
  for (const v of [row.rows[0]?.created_by, row.rows[0]?.updated_by]) if (v) out.add(v);
  const a = await q.query<{ actor_id: string }>(
    `SELECT DISTINCT actor_id FROM audit_log
      WHERE actor_kind = 'user' AND entity = $1 AND entity_id = $2 AND starts_with(action, $3) AND NOT (action = ANY($4::text[])) AND actor_id IS NOT NULL`,
    [table, id, AUTHORING_ACTIONS[kind], NON_AUTHORING],
  );
  for (const r of a.rows) out.add(r.actor_id);
  return out;
}

export interface CitationProblem {
  code: string;
  message: string;
}

/**
 * Citation completeness (docs/research/citation-policy.md): what must be true before the entity
 * can be verified. Returned as a list so the review screen can show it in advance.
 */
export async function citationProblems(q: Q, kind: CmsEntityKind, id: string): Promise<CitationProblem[]> {
  const out: CitationProblem[] = [];
  if (kind === "concept") {
    const claims = await q.query<{ position: number; quote: string | null; n_sources: number; n_missing_locator: number; n_without_passage: number }>(
      `SELECT cc.position, cc.quote,
              count(cs.source_id)::int AS n_sources,
              count(cs.source_id) FILTER (WHERE cs.locator IS NULL OR btrim(cs.locator) = '')::int AS n_missing_locator,
              count(cs.source_id) FILTER (WHERE jsonb_array_length(cs.evidence) = 0)::int AS n_without_passage
         FROM concept_claims cc LEFT JOIN concept_claim_sources cs ON cs.claim_id = cc.id
        WHERE cc.concept_id = $1 GROUP BY cc.id ORDER BY cc.position`,
      [id],
    );
    if (claims.rows.length === 0) out.push({ code: "no_claims", message: "The concept has no claims; learner text is generated from claims only." });
    for (const c of claims.rows) {
      const n = c.position + 1;
      if (c.n_sources === 0) out.push({ code: "claim_no_source", message: `Claim ${n} cites no source.` });
      if (c.n_missing_locator > 0) out.push({ code: "claim_no_locator", message: `Claim ${n}: ${c.n_missing_locator} citation(s) without a page or locator.` });
      // A claim's evidence is either its own quote or, per citation, the located passages imported
      // from content/ (FORMAT.md "Claim evidence"); a citation with neither has no evidence.
      if ((!c.quote || !c.quote.trim()) && c.n_without_passage > 0) {
        out.push({ code: "claim_no_quote", message: `Claim ${n}: ${c.n_without_passage} citation(s) without a verbatim evidence passage.` });
      }
    }
  } else if (kind === "relationship") {
    const r = await q.query<{ requires_evidence: boolean; n: number; incomplete: number; provenance_kind: string }>(
      `SELECT rt.requires_evidence, r.provenance_kind,
              (SELECT count(*)::int FROM relationship_sources rs WHERE rs.relationship_id = r.id) AS n,
              (SELECT count(*)::int FROM relationship_sources rs WHERE rs.relationship_id = r.id
                 AND (rs.locator IS NULL OR btrim(rs.locator) = '' OR rs.quote IS NULL OR btrim(rs.quote) = '')) AS incomplete
         FROM relationships r JOIN relationship_types rt ON rt.code = r.type_code WHERE r.id = $1`,
      [id],
    );
    const row = r.rows[0];
    if (row) {
      if (row.requires_evidence && row.n === 0) out.push({ code: "rel_no_source", message: "This relationship type requires evidence, but no source is cited." });
      if (row.incomplete > 0) out.push({ code: "rel_citation_incomplete", message: `${row.incomplete} citation(s) lack a page/locator or a verbatim quotation.` });
      if (row.provenance_kind === "unverified") out.push({ code: "provenance_unverified", message: 'Provenance kind "unverified" cannot be accepted.' });
    }
  } else if (kind === "source") {
    const s = await q.query<{ url: string | null; citation: string | null; author: string | null; publisher: string | null; reliability: string | null; kind: string }>(
      "SELECT url, citation, author, publisher, reliability, kind FROM sources WHERE id = $1",
      [id],
    );
    const row = s.rows[0];
    if (row) {
      if (!row.url && !row.citation) out.push({ code: "source_unlocatable", message: "Give a URL or a full formatted citation so others can find the source." });
      if (!row.author && !row.publisher) out.push({ code: "source_no_author", message: "Give an author or a publisher." });
      if (!row.reliability) out.push({ code: "source_no_reliability", message: "Rate the source's reliability." });
      if (row.kind === "unverified") out.push({ code: "provenance_unverified", message: 'Source kind "unverified" cannot be accepted.' });
    }
  } else {
    const t = await q.query<{ n: number }>("SELECT count(*)::int AS n FROM tradition_sources WHERE tradition_id = $1", [id]);
    if (t.rows[0]!.n === 0) out.push({ code: "tradition_no_source", message: "Link at least one source for the tradition's facts (GI record, region)." });
  }
  return out;
}

export interface TransitionResult {
  from: VerificationState;
  to: VerificationState;
  kind: TransitionKind;
}

export async function transition(pool: Pool, actor: Actor, input: TransitionInput): Promise<TransitionResult> {
  if (input.to === "published") {
    throw new CmsError("publish_via_release", "Content becomes published only by publishing a release snapshot (Dataset versions).", 409);
  }
  const table = TABLE[input.entityKind];
  // Authorisation that does not depend on the current state is checked before reading anything.
  ensure(actor, ["content.draft", "content.edit", "content.review", "content.verify"]);
  return inActorTx(pool, actor, input.reason, async (c) => {
    const r = await c.query<{ verification_state: VerificationState; is_demo: boolean }>(`SELECT verification_state, is_demo FROM ${table} WHERE id = $1 FOR UPDATE`, [input.entityId]);
    const row = r.rows[0];
    if (!row) throw new CmsError("not_found", `${input.entityKind} not found`, 404);
    if (row.is_demo) throw new CmsError("demo_readonly", "Demo fixtures never enter the review workflow", 409);
    const from = row.verification_state;
    const kind = classifyTransition(from, input.to);
    if (!kind || !canTransition(from, input.to)) throw new CmsError("invalid_transition", `Cannot move from ${from} to ${input.to}`, 409);
    ensure(actor, TRANSITION_PERMISSION[kind]);
    if (REASON_REQUIRED.includes(kind) && (!input.reason || input.reason.length < 3)) {
      throw new CmsError("reason_required", "Give a reason for this decision (it is kept in the review history)");
    }

    let checks: string[] = [];
    if (kind === "verify") {
      const authors = await authorsOf(c, input.entityKind, input.entityId);
      if (authors.has(actor.userId)) {
        throw new CmsError("self_verification", "You authored or edited this item, so someone else must verify it (separation of duties).", 403);
      }
      const missing = EVIDENCE_CHECK_KEYS.filter((k) => !input.evidenceChecked.includes(k));
      if (missing.length) {
        throw new CmsError("evidence_unchecked", `Confirm every evidence check before verifying: ${missing.map((k) => EVIDENCE_CHECKS[k]).join("; ")}.`);
      }
      const problems = await citationProblems(c, input.entityKind, input.entityId);
      if (problems.length) throw new CmsError("citation_incomplete", "The citations are incomplete.", 422, problems);
      checks = EVIDENCE_CHECK_KEYS;
    }
    if (kind === "submit" && input.entityKind === "relationship") {
      const issues = await edgeIssues(c, input.entityId);
      const blocking = issues.filter((i) => i.severity === "error" || i.code === "CMS201");
      if (blocking.length) {
        throw new CmsError("graph_invalid", "The knowledge-graph validator refuses this relationship.", 422, blocking.map((i) => ({ code: i.code, message: i.message })));
      }
    }
    if (kind === "submit" && input.entityKind === "concept") {
      const problems = (await citationProblems(c, "concept", input.entityId)).filter((p) => p.code === "no_claims" || p.code === "claim_no_source");
      if (problems.length) throw new CmsError("citation_incomplete", "Add sourced claims before submitting.", 422, problems);
    }

    await c.query(`UPDATE ${table} SET verification_state = $2 WHERE id = $1`, [input.entityId, input.to]);
    await audit(c, actor, {
      action: `cms.review.${kind}`,
      entity: table,
      entityId: input.entityId,
      before: { state: from },
      after: { state: input.to, evidenceChecked: checks },
      reason: input.reason,
    });
    return { from, to: input.to, kind };
  });
}

/** Which transitions the actor may attempt from `from` (for rendering buttons; the server re-checks). */
export function availableTransitions(actor: Actor, from: VerificationState, isAuthor: boolean): { to: VerificationState; kind: TransitionKind }[] {
  const targets: VerificationState[] = ["under_review", "draft", "verified", "needs_evidence", "rejected", "archived"];
  return targets
    .map((to) => ({ to, kind: classifyTransition(from, to) }))
    .filter((t): t is { to: VerificationState; kind: TransitionKind } => t.kind !== null && canTransition(from, t.to))
    .filter((t) => canAny(actor, TRANSITION_PERMISSION[t.kind]))
    .filter((t) => !(t.kind === "verify" && isAuthor));
}

const OPTION_LABEL: Record<TransitionKind, string> = {
  submit: "Submit for review",
  withdraw: "Withdraw to draft",
  restore: "Restore to draft",
  verify: "Verify",
  needs_evidence: "Needs evidence",
  reject: "Reject",
  reopen: "Reopen for review",
  archive: "Archive",
};

/** Everything the review panel needs for one entity and actor (the server re-checks on submit). */
export async function reviewOptions(q: Q, actor: Actor, kind: CmsEntityKind, id: string, state: VerificationState) {
  const authors = await authorsOf(q, kind, id);
  const isAuthor = authors.has(actor.userId);
  const options = availableTransitions(actor, state, isAuthor).map((o) => ({ ...o, label: OPTION_LABEL[o.kind] }));
  const couldVerify = state === "under_review" && canAny(actor, TRANSITION_PERMISSION.verify);
  return {
    options,
    blockedVerify: couldVerify && isAuthor ? "You authored or edited this item, so another curator must verify it." : null,
    problems: state === "under_review" ? await citationProblems(q, kind, id) : [],
  };
}
