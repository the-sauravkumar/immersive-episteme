/**
 * Participant reconstruction task: which concept map a session owes now, and saving it.
 *
 * Identity always comes from the verified participant cookie (`ParticipantIdentity`), never from
 * the client: the session row must belong to that participant, and the map is keyed by that
 * session. The client only names the item it was shown, which must equal the server's choice.
 *
 * Phase (CN-15 "Before and after learning"): decided by the server from the session's learning
 * clock. Before learning has started the task is the `pre` administration, afterwards the `post`
 * one; each is the study battery's reconstruction assessment for that phase
 * (`study_assessments.phase`). The two administrations use the same editor and, when the
 * protocol lists the same assessment in both phases, the same concept set. The post map starts
 * from the same blank layout, not from the pre map.
 *
 * Storage: `concept_maps` (nodes with positions + raw editor state with typed/directed edges and
 * the edit log), `concept_map_edges` (normalised edges), and by trigger the append-only
 * `concept_map_revisions` (every save). A final map is frozen by trigger. No score and no timing
 * is written here.
 */
import type { Pool } from "pg";

import { MAP_FORMAT, extendsLog, type MapPayload } from "@/components/assessment/map-state";

import { AssessmentError, assertUuid, inTransaction, mapDbError, type Q } from "./common";
import { conceptSetFromSnapshot, conceptSetFromTables, type ConceptSet } from "./concept-set";
import { validateMapPayload } from "./validate-map";

export interface ParticipantIdentity {
  participantId: string;
  sessionId: string;
}

export type MapPhase = "pre" | "post";

export interface StoredMap {
  id: string;
  revision: number;
  isFinal: boolean;
  payload: MapPayload;
}

export type ReconstructionTask =
  | { kind: "none"; phase: MapPhase }
  | {
      kind: "task";
      phase: MapPhase;
      assessmentId: string;
      itemId: string;
      prompt: string;
      set: ConceptSet;
      map: StoredMap | null;
    };

interface SessionRow {
  id: string;
  study_id: string;
  snapshot_id: string | null;
  learning_started_at: Date | null;
}

async function ownSession(q: Q, who: ParticipantIdentity): Promise<SessionRow> {
  assertUuid(who.sessionId, "Session");
  assertUuid(who.participantId, "Participant");
  const r = await q.query<SessionRow>(
    "SELECT id, study_id, snapshot_id, learning_started_at FROM study_sessions WHERE id = $1 AND participant_id = $2",
    [who.sessionId, who.participantId],
  );
  const row = r.rows[0];
  if (!row) throw new AssessmentError("forbidden", "This session does not belong to you.");
  return row;
}

export function rawToPayload(nodes: unknown, raw: unknown): MapPayload {
  const r = (raw ?? {}) as { edges?: MapPayload["edges"]; editLog?: MapPayload["editLog"] };
  return { nodes: (nodes ?? []) as MapPayload["nodes"], edges: r.edges ?? [], editLog: r.editLog ?? [] };
}

/** The reconstruction task this session owes now (or `none` if the protocol has none now). */
export async function loadReconstructionTask(q: Q, who: ParticipantIdentity): Promise<ReconstructionTask> {
  const session = await ownSession(q, who);
  const phase: MapPhase = session.learning_started_at ? "post" : "pre";
  const item = await q.query<{ assessment_id: string; item_id: string; prompt: string; config: unknown }>(
    `SELECT a.id AS assessment_id, i.id AS item_id, i.prompt, i.config
       FROM study_assessments sa
       JOIN assessments a ON a.id = sa.assessment_id AND a.kind = 'reconstruction'
       JOIN assessment_items i ON i.assessment_id = a.id AND i.kind = 'concept_map'
      WHERE sa.study_id = $1 AND sa.phase = $2
      ORDER BY sa.position, i.position
      LIMIT 1`,
    [session.study_id, phase],
  );
  const row = item.rows[0];
  if (!row) return { kind: "none", phase };
  const set = session.snapshot_id ? await conceptSetFromSnapshot(q, session.snapshot_id, row.config) : await conceptSetFromTables(q, row.config);
  const m = await q.query<{ id: string; revision: number; is_final: boolean; nodes: unknown; raw: unknown }>(
    "SELECT id, revision, is_final, nodes, raw FROM concept_maps WHERE session_id = $1 AND item_id = $2 AND phase = $3",
    [session.id, row.item_id, phase],
  );
  const map = m.rows[0];
  return {
    kind: "task",
    phase,
    assessmentId: row.assessment_id,
    itemId: row.item_id,
    prompt: row.prompt,
    set,
    map: map ? { id: map.id, revision: map.revision, isFinal: map.is_final, payload: rawToPayload(map.nodes, map.raw) } : null,
  };
}

export interface SaveMapInput {
  itemId: string;
  payload: unknown;
  final: boolean;
}

export interface SaveMapResult {
  conceptMapId: string;
  revision: number;
  isFinal: boolean;
}

/** Autosave or final submission of the participant's own map for the current phase. */
export async function saveParticipantMap(pool: Pool, who: ParticipantIdentity, input: SaveMapInput): Promise<SaveMapResult> {
  const task = await loadReconstructionTask(pool, who);
  if (task.kind !== "task" || task.itemId !== input.itemId) {
    throw new AssessmentError("conflict", "This task is no longer current. Reload the page.");
  }
  const payload = validateMapPayload(input.payload, task.set, { rater: false });
  const conceptOf = new Map(task.set.concepts.map((c) => [c.nodeKey, c.conceptId]));

  try {
    return await inTransaction(pool, async (client) => {
      const existing = await client.query<{ id: string; is_final: boolean; raw: unknown; nodes: unknown }>(
        "SELECT id, is_final, raw, nodes FROM concept_maps WHERE session_id = $1 AND item_id = $2 AND phase = $3 FOR UPDATE",
        [who.sessionId, task.itemId, task.phase],
      );
      const prev = existing.rows[0];
      if (prev?.is_final) throw new AssessmentError("immutable", "This map has already been submitted.");
      if (prev && !extendsLog(rawToPayload(prev.nodes, prev.raw).editLog, payload.editLog)) {
        throw new AssessmentError("conflict", "The map was changed elsewhere (another tab?). Reload the page.");
      }
      const raw = { format: MAP_FORMAT, edges: payload.edges, editLog: payload.editLog };
      let id: string;
      if (prev) {
        id = prev.id;
        await client.query("UPDATE concept_maps SET nodes = $2, raw = $3 WHERE id = $1", [id, JSON.stringify(payload.nodes), JSON.stringify(raw)]);
        await client.query("DELETE FROM concept_map_edges WHERE concept_map_id = $1", [id]);
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO concept_maps (session_id, participant_id, assessment_id, item_id, phase, nodes, raw, started_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
          [who.sessionId, who.participantId, task.assessmentId, task.itemId, task.phase, JSON.stringify(payload.nodes), JSON.stringify(raw)],
        );
        id = ins.rows[0]!.id;
      }
      for (const e of payload.edges) {
        await client.query(
          `INSERT INTO concept_map_edges (concept_map_id, edge_key, source_node_key, target_node_key, source_concept_id, target_concept_id, relationship_type_code, directed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, e.key, e.source, e.target, conceptOf.get(e.source), conceptOf.get(e.target), e.relationshipType, e.directed],
        );
      }
      if (input.final) {
        await client.query("UPDATE concept_maps SET is_final = true, submitted_at = now() WHERE id = $1", [id]);
      }
      const after = await client.query<{ revision: number; is_final: boolean }>("SELECT revision, is_final FROM concept_maps WHERE id = $1", [id]);
      return { conceptMapId: id, revision: after.rows[0]!.revision, isFinal: after.rows[0]!.is_final };
    });
  } catch (err) {
    if (err instanceof AssessmentError) throw err;
    mapDbError(err);
  }
}
