/**
 * Export re-import validation (spec §10.4 "verify that exported records can be joined by
 * participant, session, condition, concept, and event identifiers"; §15.4 "derived metrics can be
 * recomputed from exported raw records"). Pure: takes a parsed bundle, uses nothing else.
 *
 * Checks: format and version; per-table checksums; required columns; unique keys; joins
 * (participant, session, condition, concept, event, concept map); and recomputation of every
 * exported derived metric from the exported raw events, content facts and concept maps
 * (value and input hash must match).
 */
import { canonicalHash } from "@/features/spatial/compiler/canonical";

import type { MapEdgeInput } from "../metrics/correspondence";
import type { ConceptFacts } from "../metrics/navigation";
import { computeSessionMetrics } from "../metrics/session";
import type { Row } from "./csv";
import { EXPORT_FORMAT, EXPORT_SCHEMA_VERSION, type ExportBundle } from "./build";
import { TABLE_BY_NAME } from "./dictionary";

export interface ExportValidation {
  ok: boolean;
  errors: string[];
  counts: Record<string, number>;
  recomputed: { metrics: number; matched: number };
}

const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function validateExportBundle(bundle: ExportBundle): ExportValidation {
  const errors: string[] = [];
  const err = (m: string) => {
    if (errors.length < 200) errors.push(m);
  };
  if (bundle?.format !== EXPORT_FORMAT) err(`Unknown format ${String(bundle?.format)}`);
  if (bundle?.exportSchemaVersion !== EXPORT_SCHEMA_VERSION) err(`Unsupported exportSchemaVersion ${String(bundle?.exportSchemaVersion)}`);
  const tables = bundle?.tables ?? {};
  const counts: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) {
    counts[name] = rows.length;
    const spec = TABLE_BY_NAME.get(name);
    if (!spec) {
      err(`Unexpected table ${name}`);
      continue;
    }
    if (spec.identifiedOnly && bundle.scope !== "identified") err(`Table ${name} must not appear in a ${bundle.scope} export`);
    if (canonicalHash(rows) !== bundle.checksums?.[name]) err(`Checksum mismatch for table ${name}`);
    const cols = spec.columns.map((c) => c.name);
    rows.forEach((r, i) => {
      const keys = Object.keys(r);
      if (keys.length !== cols.length || cols.some((c) => !(c in r))) err(`${name}[${i}] does not have the dictionary columns`);
    });
  }
  const t = (name: string): Row[] => tables[name] ?? [];

  const participants = new Set(t("participants").map((r) => str(r.participant_code)));
  const conditions = new Set(t("conditions").map((r) => str(r.condition_id)));
  const sessions = new Map(t("sessions").map((r) => [str(r.session_id), r]));
  const concepts = new Set((bundle.contentManifest?.concepts ?? []).map((c) => c.id));
  const maps = new Map(t("concept_maps").map((r) => [str(r.concept_map_id), r]));
  if (participants.size !== t("participants").length) err("participant_code is not unique");
  if (sessions.size !== t("sessions").length) err("session_id is not unique");

  for (const r of t("allocations")) {
    if (!participants.has(str(r.participant_code))) err(`allocation for unknown participant ${str(r.participant_code)}`);
    if (!conditions.has(str(r.condition_id))) err(`allocation to unknown condition ${str(r.condition_id)}`);
  }
  for (const r of t("sessions")) {
    if (!participants.has(str(r.participant_code))) err(`session ${str(r.session_id)} has unknown participant`);
    // A session opened at consent has no condition until it is allocated after the pre-test (D3):
    // a participant still in, or dropped out during, the pre-test keeps condition_id null.
    if (r.condition_id !== null && !conditions.has(str(r.condition_id))) err(`session ${str(r.session_id)} has unknown condition`);
  }
  const eventIds = new Set<string | null>();
  const seqKeys = new Set<string>();
  for (const r of t("events")) {
    const s = sessions.get(str(r.session_id));
    if (!s) err(`event ${str(r.event_id)} has unknown session`);
    else if (s.participant_code !== r.participant_code || s.condition_id !== r.condition_id) err(`event ${str(r.event_id)} disagrees with its session on participant/condition`);
    if (eventIds.has(str(r.event_id))) err(`duplicate event_id ${str(r.event_id)}`);
    eventIds.add(str(r.event_id));
    const k = `${str(r.session_id)}#${str(r.seq)}`;
    if (seqKeys.has(k)) err(`duplicate (session, seq) ${k}`);
    seqKeys.add(k);
    if (r.concept_id && !concepts.has(String(r.concept_id))) err(`event ${str(r.event_id)} references concept ${String(r.concept_id)} not in the content manifest`);
  }
  for (const name of ["derived_metrics", "derived_scores", "responses", "concept_maps"]) {
    for (const r of t(name)) {
      const s = sessions.get(str(r.session_id));
      if (!s) err(`${name} row for unknown session ${str(r.session_id)}`);
      else if (s.participant_code !== r.participant_code) err(`${name} row disagrees with its session on participant`);
    }
  }
  for (const r of t("concept_map_edges")) {
    if (!maps.has(str(r.concept_map_id))) err(`edge ${str(r.edge_key)} of unknown concept map`);
    for (const k of ["source_concept_id", "target_concept_id"] as const) if (r[k] && !concepts.has(String(r[k]))) err(`edge ${str(r.edge_key)} references concept ${String(r[k])} not in the content manifest`);
  }

  // Recompute derived metrics from the exported raw records.
  const facts = new Map<string, ConceptFacts>((bundle.contentManifest?.concepts ?? []).map((c) => [c.id, { traditionId: c.traditionId, category: c.category }]));
  const rels = bundle.contentManifest?.relationships ?? [];
  const eventsBySession = new Map<string, Row[]>();
  for (const e of t("events")) (eventsBySession.get(String(e.session_id)) ?? eventsBySession.set(String(e.session_id), []).get(String(e.session_id))!).push(e);
  const edgesByMap = new Map<string, MapEdgeInput[]>();
  for (const e of t("concept_map_edges")) {
    (edgesByMap.get(String(e.concept_map_id)) ?? edgesByMap.set(String(e.concept_map_id), []).get(String(e.concept_map_id))!).push({
      sourceConceptId: str(e.source_concept_id),
      targetConceptId: str(e.target_concept_id),
      relationshipTypeCode: str(e.relationship_type_code),
      directed: e.directed !== false,
    });
  }
  const finalPostMap = (sessionId: string) => {
    const candidates = t("concept_maps")
      .filter((m) => m.session_id === sessionId && m.phase === "post" && m.is_final === true)
      .sort((a, b) => (String(b.submitted_at ?? "") < String(a.submitted_at ?? "") ? -1 : String(b.submitted_at ?? "") > String(a.submitted_at ?? "") ? 1 : String(b.concept_map_id) < String(a.concept_map_id) ? -1 : 1));
    const m = candidates[0];
    return m ? { id: String(m.concept_map_id), revision: Number(m.revision), edges: edgesByMap.get(String(m.concept_map_id)) ?? [] } : null;
  };
  const recomputed = new Map<string, { value: number | null; sha: string }>();
  for (const sessionId of new Set(t("derived_metrics").map((r) => String(r.session_id)))) {
    const events = (eventsBySession.get(sessionId) ?? []).map((e) => ({
      eventId: String(e.event_id),
      seq: Number(e.seq),
      type: String(e.event_type),
      conceptId: str(e.concept_id),
      metadata: (e.metadata ?? {}) as Record<string, unknown>,
    }));
    const out = computeSessionMetrics({ events, concepts: facts, relationships: rels, map: finalPostMap(sessionId) });
    for (const v of out.values) recomputed.set(`${sessionId}#${v.metricName}#${v.metricVersion}`, { value: v.value, sha: out.inputSha256 });
  }
  let matched = 0;
  for (const r of t("derived_metrics")) {
    const k = `${String(r.session_id)}#${String(r.metric_name)}#${String(r.metric_version)}`;
    const re = recomputed.get(k);
    if (!re) {
      err(`metric ${k} cannot be recomputed by this pipeline version`);
      continue;
    }
    const v = r.value === null ? null : Number(r.value);
    const same = v === null || re.value === null ? v === re.value : Math.abs(v - re.value) <= 1e-9 * Math.max(1, Math.abs(v));
    if (!same) err(`metric ${k}: exported ${String(v)} but recomputed ${String(re.value)}`);
    else if (r.input_sha256 !== re.sha) err(`metric ${k}: input hash differs (stale metric; recompute before exporting)`);
    else matched++;
  }
  return { ok: errors.length === 0, errors, counts, recomputed: { metrics: t("derived_metrics").length, matched } };
}
