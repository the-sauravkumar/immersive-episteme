/**
 * Expert reference maps: several raters author a map over the same fixed concept set, the
 * existing scoring library computes inter-rater agreement (`raterAgreement`) and the consensus
 * (`buildConsensus`, strict majority with ties flagged `disputed`), an adjudicator settles the
 * disputes, and finalising writes the adjudicated edges. Versions are rows of `reference_maps`
 * (`(assessment_id, version)`); a locked version is immutable in the database.
 *
 * Storage:
 *  - each rater's map: `reference_map_raters` (role `rater`), `submission = { conceptIds, edges,
 *    editor }` where `edges` are ReferenceEdgeInput objects and `editor` is the raw editor payload
 *    (positions and edit log);
 *  - adjudications: the single adjudicator's row (role `adjudicator`), `submission =
 *    { edges: [], adjudications: [{ key, decision, note, decidedAt }] }`;
 *  - the adjudicated map: `reference_map_edges` (`required` = expected, `notes` =
 *    `consensus:<decision>`, `agreement` = share of raters) and `adjudicated_by/at`.
 *
 * Demo reference maps must stay `draft` (reference_maps_demo_ck), so finalising a demo map sets
 * `adjudicated_by/at` and writes the edges but keeps the status; scoring accepts any map with
 * `adjudicated_at` set. After finalising, the map no longer accepts rater or adjudicator edits:
 * a change is a new version.
 */
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import {
  buildConsensus,
  raterAgreement,
  type Adjudication,
  type ConsensusResult,
  type RaterMapInput,
  type ReferenceEdgeInput,
  type ScoringConfigInput,
} from "@/features/assessment/scoring";
import type { MapPayload } from "@/components/assessment/map-state";
import { DEMO_TITLE_PREFIX } from "@/lib/validation/primitives";

import { AssessmentError, assertUuid, audit, inTransaction, mapDbError, type Q } from "./common";
import { conceptSetFromTables, type ConceptSet } from "./concept-set";
import { validateMapPayload } from "./validate-map";

export interface ReferenceMapSummary {
  id: string;
  assessmentId: string;
  version: number;
  title: string;
  status: "draft" | "adjudicated" | "locked";
  isDemo: boolean;
  adjudicatedAt: Date | null;
  adjudicatedBy: string | null;
  raterCount: number;
  edgeCount: number;
}

type RefRow = {
  id: string;
  assessment_id: string;
  version: number;
  title: string;
  description: string | null;
  status: "draft" | "adjudicated" | "locked";
  is_demo: boolean;
  adjudicated_at: Date | null;
  adjudicated_by: string | null;
  adjudication_notes: string | null;
  rater_count: string;
  edge_count: string;
};

const SELECT_REF = `SELECT r.*, (SELECT count(*) FROM reference_map_raters x WHERE x.reference_map_id = r.id AND x.role = 'rater') AS rater_count,
       (SELECT count(*) FROM reference_map_edges e WHERE e.reference_map_id = r.id) AS edge_count FROM reference_maps r`;

const toSummary = (r: RefRow): ReferenceMapSummary => ({
  id: r.id,
  assessmentId: r.assessment_id,
  version: r.version,
  title: r.title,
  status: r.status,
  isDemo: r.is_demo,
  adjudicatedAt: r.adjudicated_at,
  adjudicatedBy: r.adjudicated_by,
  raterCount: Number(r.rater_count),
  edgeCount: Number(r.edge_count),
});

export async function listReferenceMaps(q: Q, assessmentId?: string): Promise<ReferenceMapSummary[]> {
  if (assessmentId) assertUuid(assessmentId, "Assessment");
  const r = await q.query<RefRow>(`${SELECT_REF} ${assessmentId ? "WHERE r.assessment_id = $1" : ""} ORDER BY r.assessment_id, r.version DESC`, assessmentId ? [assessmentId] : []);
  return r.rows.map(toSummary);
}

/** Loads the reconstruction assessment's concept-map item and its concept set. */
export async function reconstructionItem(q: Q, assessmentId: string): Promise<{ itemId: string; status: string; isDemo: boolean; scoring: ScoringConfigInput; set: ConceptSet }> {
  assertUuid(assessmentId, "Assessment");
  const r = await q.query<{ item_id: string; config: unknown; status: string; is_demo: boolean; a_config: { scoring?: ScoringConfigInput } }>(
    `SELECT i.id AS item_id, i.config, a.status, a.is_demo, a.config AS a_config FROM assessments a
       JOIN assessment_items i ON i.assessment_id = a.id AND i.kind = 'concept_map'
      WHERE a.id = $1 AND a.kind = 'reconstruction' ORDER BY i.position LIMIT 1`,
    [assessmentId],
  );
  const row = r.rows[0];
  if (!row) throw new AssessmentError("not_found", "Reconstruction assessment with a concept-map item not found");
  return { itemId: row.item_id, status: row.status, isDemo: row.is_demo, scoring: row.a_config.scoring ?? {}, set: await conceptSetFromTables(q, row.config) };
}

export const newReferenceSchema = z.object({ title: z.string().trim().min(1).max(300), description: z.string().trim().max(4000).optional() });

/** A new reference-map version for a published reconstruction assessment. */
export async function createReferenceMap(q: Q, actorId: string, assessmentId: string, input: z.input<typeof newReferenceSchema>): Promise<string> {
  const { title: rawTitle, description } = newReferenceSchema.parse(input);
  const item = await reconstructionItem(q, assessmentId);
  if (item.status !== "locked") throw new AssessmentError("invalid", "Publish the assessment first: a reference map needs a fixed concept set.");
  const title = item.isDemo && !rawTitle.startsWith(DEMO_TITLE_PREFIX) ? `${DEMO_TITLE_PREFIX} ${rawTitle}` : rawTitle;
  if (!item.isDemo && title.startsWith(DEMO_TITLE_PREFIX)) throw new AssessmentError("invalid", "Only demo reference maps may have a 'Demo:' title.");
  const v = await q.query<{ v: number }>("SELECT coalesce(max(version), 0) + 1 AS v FROM reference_maps WHERE assessment_id = $1", [assessmentId]);
  const nodes = item.set.concepts.map((c) => ({ conceptId: c.conceptId, label: c.label }));
  const r = await q.query<{ id: string }>(
    "INSERT INTO reference_maps (assessment_id, version, title, description, nodes, is_demo, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [assessmentId, v.rows[0]!.v, title, description ?? null, JSON.stringify(nodes), item.isDemo, actorId],
  );
  return r.rows[0]!.id;
}

interface RaterRow {
  rater_id: string;
  role: "rater" | "adjudicator";
  submission: { conceptIds?: string[]; edges?: ReferenceEdgeInput[]; editor?: MapPayload; adjudications?: Array<Adjudication & { decidedAt?: string }> };
  submitted_at: Date;
  name: string | null;
}

export interface ReferenceWorkspace {
  map: ReferenceMapSummary & { description: string | null; adjudicationNotes: string | null };
  set: ConceptSet;
  scoring: ScoringConfigInput;
  raters: Array<{ raterId: string; name: string; submittedAt: Date; edgeCount: number }>;
  ownSubmission: MapPayload | null;
  adjudicator: { id: string; name: string } | null;
  adjudications: Array<Adjudication & { decidedAt?: string }>;
  /** Union universe: positive agreement and per-edge support (kappa is undefined there). */
  agreement: ReturnType<typeof raterAgreement> | null;
  /**
   * Kappa over a DEFINED universe (final review scoring-01): every possible edge over the item's
   * concept set and relationship types. Null when the item has no relationship types.
   */
  kappaAgreement: ReturnType<typeof raterAgreement> | null;
  consensus: ConsensusResult | null;
  /** Edges written at finalisation. */
  finalEdges: Array<{ sourceConceptId: string; targetConceptId: string; relationshipTypeCode: string | null; directed: boolean; required: boolean; agreement: number | null; notes: string | null }>;
}

async function loadRef(q: Q, id: string): Promise<RefRow> {
  assertUuid(id, "Reference map");
  const r = await q.query<RefRow>(`${SELECT_REF} WHERE r.id = $1`, [id]);
  if (!r.rows[0]) throw new AssessmentError("not_found", "Reference map not found");
  return r.rows[0];
}

const fmt3 = (x: number | null | undefined) => (x === null || x === undefined ? "undefined" : x.toFixed(3));

function raterInputs(rows: RaterRow[]): RaterMapInput[] {
  return rows.filter((r) => r.role === "rater").map((r) => ({ raterId: r.rater_id, conceptIds: r.submission.conceptIds ?? [], edges: r.submission.edges ?? [] }));
}

export async function getReferenceWorkspace(q: Q, id: string, viewerId: string): Promise<ReferenceWorkspace> {
  const ref = await loadRef(q, id);
  const item = await reconstructionItem(q, ref.assessment_id);
  const rows = (
    await q.query<RaterRow>(
      "SELECT x.rater_id, x.role, x.submission, x.submitted_at, u.name FROM reference_map_raters x LEFT JOIN users u ON u.id = x.rater_id WHERE x.reference_map_id = $1 ORDER BY x.submitted_at",
      [id],
    )
  ).rows;
  const inputs = raterInputs(rows);
  const adjRow = rows.find((r) => r.role === "adjudicator") ?? null;
  const adjudications = adjRow?.submission.adjudications ?? [];
  const options = { config: item.scoring };
  let agreement: ReferenceWorkspace["agreement"] = null;
  let kappaAgreement: ReferenceWorkspace["kappaAgreement"] = null;
  let consensus: ConsensusResult | null = null;
  if (inputs.length >= 2) {
    agreement = raterAgreement(inputs, options);
    const relationshipTypes = item.set.relationshipTypes.map((x) => x.code);
    if (relationshipTypes.length > 0) {
      kappaAgreement = raterAgreement(inputs, { ...options, universe: "all_possible", conceptIds: item.set.concepts.map((c) => c.conceptId), relationshipTypes });
    }
    // A rater may revise their map after an adjudication; decisions on edges no rater proposes
    // any more are kept in storage but not applied.
    const candidates = new Set(buildConsensus(inputs, options).edges.map((e) => e.key));
    consensus = buildConsensus(inputs, {
      ...options,
      adjudications: adjudications.filter((a) => candidates.has(a.key)).map(({ key, decision, adjudicatorId, note }) => ({ key, decision, adjudicatorId, ...(note ? { note } : {}) })),
    });
  }
  const edges = await q.query<{ source_concept_id: string; target_concept_id: string; relationship_type_code: string | null; directed: boolean; required: boolean; agreement: number | null; notes: string | null }>(
    "SELECT source_concept_id, target_concept_id, relationship_type_code, directed, required, agreement, notes FROM reference_map_edges WHERE reference_map_id = $1 ORDER BY source_concept_id, target_concept_id, relationship_type_code",
    [id],
  );
  const own = rows.find((r) => r.role === "rater" && r.rater_id === viewerId);
  return {
    map: { ...toSummary(ref), description: ref.description, adjudicationNotes: ref.adjudication_notes },
    set: item.set,
    scoring: item.scoring,
    raters: rows.filter((r) => r.role === "rater").map((r) => ({ raterId: r.rater_id, name: r.name ?? r.rater_id, submittedAt: r.submitted_at, edgeCount: r.submission.edges?.length ?? 0 })),
    ownSubmission: own?.submission.editor ?? null,
    adjudicator: adjRow ? { id: adjRow.rater_id, name: adjRow.name ?? adjRow.rater_id } : null,
    adjudications,
    agreement,
    kappaAgreement,
    consensus,
    finalEdges: edges.rows.map((e) => ({
      sourceConceptId: e.source_concept_id,
      targetConceptId: e.target_concept_id,
      relationshipTypeCode: e.relationship_type_code,
      directed: e.directed,
      required: e.required,
      agreement: e.agreement,
      notes: e.notes,
    })),
  };
}

function assertOpen(ref: RefRow): void {
  if (ref.status !== "draft" || ref.adjudicated_at) throw new AssessmentError("immutable", "This reference map is finalised. Create a new version to change it.");
}

/** A rater's own map (create or revise until finalisation). */
export async function submitRaterMap(q: Q, raterId: string, referenceMapId: string, payloadInput: unknown): Promise<void> {
  const ref = await loadRef(q, referenceMapId);
  assertOpen(ref);
  const item = await reconstructionItem(q, ref.assessment_id);
  const payload = validateMapPayload(payloadInput, item.set, { rater: true });
  const conceptOf = new Map(item.set.concepts.map((c) => [c.nodeKey, c.conceptId]));
  const edges: ReferenceEdgeInput[] = payload.edges.map((e) => ({
    sourceConceptId: conceptOf.get(e.source)!,
    targetConceptId: conceptOf.get(e.target)!,
    relationshipTypeCode: e.relationshipType,
    directed: e.directed,
    required: e.required ?? false,
  }));
  const submission = { conceptIds: item.set.concepts.map((c) => c.conceptId), edges, editor: payload };
  try {
    await q.query(
      `INSERT INTO reference_map_raters (reference_map_id, rater_id, role, submission) VALUES ($1, $2, 'rater', $3)
       ON CONFLICT (reference_map_id, rater_id, role) DO UPDATE SET submission = EXCLUDED.submission, submitted_at = now()`,
      [referenceMapId, raterId, JSON.stringify(submission)],
    );
  } catch (err) {
    mapDbError(err);
  }
}

export const adjudicationSchema = z.object({
  key: z.string().min(1).max(400),
  decision: z.enum(["expected", "optional", "excluded"]),
  note: z.string().trim().max(2000).optional(),
});

/** Records (or replaces) the adjudicator's decision on one candidate edge. One adjudicator per map. */
export async function recordAdjudication(pool: Pool, adjudicatorId: string, referenceMapId: string, input: z.input<typeof adjudicationSchema>): Promise<void> {
  const adj = adjudicationSchema.parse(input);
  await inTransaction(pool, async (c) => {
    const ref = await loadRef(c, referenceMapId);
    assertOpen(ref);
    await c.query("SELECT id FROM reference_maps WHERE id = $1 FOR UPDATE", [referenceMapId]);
    const ws = await getReferenceWorkspace(c, referenceMapId, adjudicatorId);
    if (!ws.consensus) throw new AssessmentError("invalid", "Adjudication needs at least two rater maps.");
    if (!ws.consensus.edges.some((e) => e.key === adj.key)) throw new AssessmentError("invalid", "Unknown candidate edge.");
    if (ws.adjudicator && ws.adjudicator.id !== adjudicatorId) throw new AssessmentError("forbidden", `This map is adjudicated by ${ws.adjudicator.name}.`);
    const others = ws.adjudications.filter((a) => a.key !== adj.key);
    const entry = { key: adj.key, decision: adj.decision, adjudicatorId, ...(adj.note ? { note: adj.note } : {}), decidedAt: new Date().toISOString() };
    const submission = { edges: [], adjudications: [...others, entry].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) };
    await c.query(
      `INSERT INTO reference_map_raters (reference_map_id, rater_id, role, submission) VALUES ($1, $2, 'adjudicator', $3)
       ON CONFLICT (reference_map_id, rater_id, role) DO UPDATE SET submission = EXCLUDED.submission, submitted_at = now()`,
      [referenceMapId, adjudicatorId, JSON.stringify(submission)],
    );
    await audit(c, { actorId: adjudicatorId, action: "reference_map.adjudicate_edge", entity: "reference_maps", entityId: referenceMapId, after: entry });
  });
}

/** Writes the adjudicated consensus as the reference edges. Refused while any edge is disputed. */
export async function finaliseReferenceMap(pool: Pool, actorId: string, referenceMapId: string, notes: string | null): Promise<void> {
  await inTransaction(pool, async (c) => {
    await c.query("SELECT id FROM reference_maps WHERE id = $1 FOR UPDATE", [referenceMapId]);
    const ref = await loadRef(c, referenceMapId);
    assertOpen(ref);
    const ws = await getReferenceWorkspace(c, referenceMapId, actorId);
    if (!ws.consensus) throw new AssessmentError("invalid", "Finalising needs at least two rater maps.");
    if (!ws.consensus.isComplete) throw new AssessmentError("invalid", `${ws.consensus.unresolved.length} tied edge(s) still need adjudication.`);
    try {
      await c.query("DELETE FROM reference_map_edges WHERE reference_map_id = $1", [referenceMapId]);
      for (const e of ws.consensus.edges) {
        if (e.decision === "excluded" || e.decision === "disputed") continue;
        await c.query(
          `INSERT INTO reference_map_edges (reference_map_id, source_concept_id, target_concept_id, relationship_type_code, directed, required, agreement, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [referenceMapId, e.source, e.target, e.type, e.directed, e.decision === "expected", e.agreement, `consensus:${e.decision}`],
        );
      }
      const summary = `${notes?.trim() ? `${notes.trim()}\n` : ""}Consensus ${ws.consensus.metricVersion} (${String(ws.consensus.parameters.rule)}), ${ws.consensus.raterCount} raters, ${ws.consensus.edges.filter((e) => e.decidedBy === "adjudication").length} adjudicated edge(s); positive agreement ${fmt3(ws.agreement?.positiveAgreement)} (${String(ws.agreement?.parameters.level)}, union of proposed edges); Fleiss kappa ${fmt3(ws.kappaAgreement?.fleissKappa)} (${ws.kappaAgreement ? `${String(ws.kappaAgreement.parameters.level)}, all possible edges over the concept set and relationship types` : "not computed: no relationship types"}).`;
      await c.query(
        `UPDATE reference_maps SET status = CASE WHEN is_demo THEN 'draft'::reference_map_status ELSE 'adjudicated'::reference_map_status END,
                adjudicated_by = $2, adjudicated_at = now(), adjudication_notes = $3 WHERE id = $1`,
        [referenceMapId, actorId, summary],
      );
    } catch (err) {
      mapDbError(err);
    }
    await audit(c, { actorId, action: "reference_map.finalise", entity: "reference_maps", entityId: referenceMapId, after: { unresolved: 0, edges: ws.consensus.edges.length } });
  });
}

/** Locks an adjudicated (non-demo) reference map: immutable in the database from now on. */
/** Locks an adjudicated map: checked, locked and audited in one transaction on the locked row (database-08). */
export async function lockReferenceMap(pool: Pool | PoolClient, actorId: string, referenceMapId: string): Promise<void> {
  assertUuid(referenceMapId, "Reference map");
  await inTransaction(pool, async (q) => {
    await q.query("SELECT 1 FROM reference_maps WHERE id = $1 FOR UPDATE", [referenceMapId]);
    const ref = await loadRef(q, referenceMapId);
    if (ref.status !== "adjudicated") throw new AssessmentError("invalid", ref.is_demo ? "Demo reference maps stay draft and cannot be locked." : "Only an adjudicated map can be locked.");
    await q.query("UPDATE reference_maps SET status = 'locked' WHERE id = $1", [referenceMapId]);
    await audit(q, { actorId, action: "reference_map.lock", entity: "reference_maps", entityId: referenceMapId });
  });
}
