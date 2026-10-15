/**
 * Dashboard rows 3 and 4 of DESIGN.md 11.9 that the live read model (src/server/research/
 * dashboard.ts) does not carry: Figure 3 "Gain by Tradition", Figure 4 "Dwell Time per Layer" and
 * Table 2 "Per-Item Statistics". All are read from stored derived values only; nothing is
 * estimated, imputed or sampled.
 *
 *  - Gain by tradition: the knowledge test split by the tradition of each keyed item's concept
 *    (`assessment_items.concept_id` -> `concepts.tradition_id`). Per session and tradition, the
 *    proportion of that tradition's keyed post-test items answered correctly minus the proportion
 *    of its keyed pre-test items answered correctly (stored `item.key_match`, latest attempt). A
 *    session counts for a tradition only when it has scored items of that tradition in both tests.
 *    Items without a concept, or whose concept belongs to no tradition, are not counted. This is
 *    a descriptive breakdown of the knowledge test, not a registered outcome.
 *  - Dwell time per layer: the versioned session metric `time.exposure_by_layer_ms`
 *    (src/features/telemetry/metrics.ts), whose `details.byLayer` splits the active exposure time
 *    of a session by the telemetry layer. It is written by the metrics pipeline (Analytics,
 *    "Recompute metrics"), so it is as current as the last recompute; the caption says so.
 *  - Per-item statistics: the stored `item.key_match` score of each keyed answer
 *    (src/features/assessment/responses.ts KEY_MATCH_METRIC: 1 = matches the answer key): one
 *    score per session and item (latest attempt, latest computation), as keyed scoring itself
 *    scores the latest answered attempt. Proportion correct per item and condition.
 *
 * Scope is the dashboard's: sessions with a condition that are not excluded and not withdrawn
 * (the dashboard labels a demo study as non-experimental as a whole, so demo sessions stay in).
 * The aggregation functions are pure, so tests feed them rows.
 */
import { EXPOSURE_LAYERS } from "@/features/telemetry/contracts";
import { inCanonicalOrder, KNOWLEDGE_LAYERS } from "@/features/learning/labels";
import type { Q } from "@/server/research/db";

/** The dwell-time metric and its layer split (src/features/telemetry/metrics.ts). */
export const LAYER_METRIC = "time.exposure_by_layer_ms";
/** The per-answer keyed score (src/features/assessment/responses.ts). */
export const ITEM_METRIC = "item.key_match";

/** Layer columns in the one canonical order (labels.ts), then the citation layer telemetry also records. */
export const LAYER_COLUMNS: readonly { id: string; label: string }[] = [
  ...KNOWLEDGE_LAYERS.map((l) => ({ id: l.id as string, label: l.label as string })),
  ...EXPOSURE_LAYERS.filter((id) => !KNOWLEDGE_LAYERS.some((l) => l.id === id)).map((id) => ({ id: id as string, label: id.charAt(0).toUpperCase() + id.slice(1) })),
];

export interface LayerMetricRow {
  conditionId: string;
  sessionId: string;
  metricVersion: string;
  /** `details.byLayer` as stored: layer id -> active milliseconds. */
  byLayer: Record<string, unknown> | null;
}

export interface LayerDwell {
  /** Condition ids, in the order given. */
  conditions: string[];
  /** Sessions contributing per condition. */
  n: number[];
  /** Mean active minutes per session, [condition][layer column]; null when no session. */
  meanMinutes: (number | null)[][];
  /** Metric versions present (normally one). */
  versions: string[];
}

/**
 * Mean active minutes per session for every layer, by condition. A session that has the metric
 * but never opened a layer contributes 0 to that layer (its split simply has no key for it).
 */
export function layerDwell(rows: readonly LayerMetricRow[], conditionIds: readonly string[]): LayerDwell {
  const sums = conditionIds.map(() => LAYER_COLUMNS.map(() => 0));
  const n = conditionIds.map(() => 0);
  const versions = new Set<string>();
  for (const r of rows) {
    const ci = conditionIds.indexOf(r.conditionId);
    if (ci < 0) continue;
    n[ci]!++;
    versions.add(r.metricVersion);
    LAYER_COLUMNS.forEach((col, li) => {
      const v = Number(r.byLayer?.[col.id] ?? 0);
      if (Number.isFinite(v) && v > 0) sums[ci]![li]! += v;
    });
  }
  return {
    conditions: [...conditionIds],
    n,
    meanMinutes: sums.map((row, ci) => row.map((ms) => (n[ci]! > 0 ? ms / n[ci]! / 60000 : null))),
    versions: [...versions].sort(),
  };
}

export interface ItemScoreRow {
  conditionId: string;
  assessmentCode: string;
  assessmentVersion: number;
  assessmentKind: string;
  itemKey: string;
  position: number;
  value: number | null;
}

export interface ItemStat {
  assessment: string;
  kind: string;
  itemKey: string;
  position: number;
  /** Per condition (the order given): answers scored, answers with an undefined score, proportion correct. */
  byCondition: { n: number; undefined: number; correct: number | null }[];
}

const KIND_ORDER: Record<string, number> = { pretest: 0, posttest: 1, transfer: 2 };

/** Proportion correct per keyed item and condition; items in assessment (pre, post, transfer) and position order. */
export function itemStatistics(rows: readonly ItemScoreRow[], conditionIds: readonly string[]): ItemStat[] {
  const items = new Map<string, ItemStat & { sums: number[]; order: [number, string, number] }>();
  for (const r of rows) {
    const ci = conditionIds.indexOf(r.conditionId);
    if (ci < 0) continue;
    const assessment = `${r.assessmentCode} v${r.assessmentVersion}`;
    const key = `${assessment}|${r.itemKey}`;
    const it =
      items.get(key) ??
      items
        .set(key, {
          assessment,
          kind: r.assessmentKind,
          itemKey: r.itemKey,
          position: r.position,
          byCondition: conditionIds.map(() => ({ n: 0, undefined: 0, correct: null })),
          sums: conditionIds.map(() => 0),
          order: [KIND_ORDER[r.assessmentKind] ?? 3, assessment, r.position],
        })
        .get(key)!;
    const cell = it.byCondition[ci]!;
    if (r.value === null || !Number.isFinite(Number(r.value))) cell.undefined++;
    else {
      cell.n++;
      it.sums[ci]! += Number(r.value);
    }
  }
  return [...items.values()]
    .sort((a, b) => a.order[0] - b.order[0] || (a.order[1] < b.order[1] ? -1 : a.order[1] > b.order[1] ? 1 : 0) || a.order[2] - b.order[2])
    .map(({ sums, order: _order, ...it }) => ({ ...it, byCondition: it.byCondition.map((c, ci) => ({ ...c, correct: c.n > 0 ? sums[ci]! / c.n : null })) }));
}

export interface TraditionItemRow {
  conditionId: string;
  sessionId: string;
  traditionSlug: string;
  traditionName: string;
  /** Assessment kind: only `pretest` and `posttest` rows count. */
  kind: string;
  value: number | null;
}

export interface TraditionGain {
  slug: string;
  name: string;
  /** Per condition (the order given): one gain per session, post minus pre proportion correct. */
  gains: number[][];
}

/** Knowledge-test gain per tradition and condition; traditions in the canonical (alphabetical) order. */
export function traditionGains(rows: readonly TraditionItemRow[], conditionIds: readonly string[]): TraditionGain[] {
  type Cell = { pre: [number, number]; post: [number, number] };
  const traditions = new Map<string, { slug: string; name: string; sessions: Map<string, { ci: number; cell: Cell }> }>();
  for (const r of rows) {
    const ci = conditionIds.indexOf(r.conditionId);
    if (ci < 0 || (r.kind !== "pretest" && r.kind !== "posttest")) continue;
    if (r.value === null || !Number.isFinite(Number(r.value))) continue;
    const t = traditions.get(r.traditionSlug) ?? traditions.set(r.traditionSlug, { slug: r.traditionSlug, name: r.traditionName, sessions: new Map() }).get(r.traditionSlug)!;
    const s = t.sessions.get(r.sessionId) ?? t.sessions.set(r.sessionId, { ci, cell: { pre: [0, 0], post: [0, 0] } }).get(r.sessionId)!;
    const acc = r.kind === "pretest" ? s.cell.pre : s.cell.post;
    acc[0] += Number(r.value);
    acc[1]++;
  }
  return inCanonicalOrder([...traditions.values()]).map((t) => {
    const gains = conditionIds.map(() => [] as number[]);
    for (const { ci, cell } of t.sessions.values()) {
      if (cell.pre[1] > 0 && cell.post[1] > 0) gains[ci]!.push(cell.post[0] / cell.post[1] - cell.pre[0] / cell.pre[1]);
    }
    return { slug: t.slug, name: t.name, gains };
  });
}

/** In-scope sessions of the study (the dashboard's rule). */
const IN_SCOPE = "ss.condition_id IS NOT NULL AND NOT ss.excluded AND NOT ss.withdrawn";

export async function loadLayerMetricRows(q: Q, studyId: string): Promise<LayerMetricRow[]> {
  const r = await q.query<{ condition_id: string; session_id: string; metric_version: string; by_layer: Record<string, unknown> | null }>(
    `SELECT DISTINCT ON (dm.session_id) dm.condition_id, dm.session_id, dm.metric_version, dm.details->'byLayer' AS by_layer
       FROM derived_metrics dm JOIN study_sessions ss ON ss.id = dm.session_id
      WHERE dm.study_id = $1 AND dm.metric_name = $2 AND ${IN_SCOPE}
      ORDER BY dm.session_id, dm.computed_at DESC`,
    [studyId, LAYER_METRIC],
  );
  return r.rows.map((x) => ({ conditionId: x.condition_id, sessionId: x.session_id, metricVersion: x.metric_version, byLayer: x.by_layer }));
}

export async function loadItemScoreRows(q: Q, studyId: string): Promise<ItemScoreRow[]> {
  const r = await q.query<{ condition_id: string; code: string; version: number; kind: string; item_key: string; position: number; value: number | null }>(
    `SELECT DISTINCT ON (ds.session_id, r.item_id) ss.condition_id, a.code, a.version, a.kind::text AS kind, i.item_key, i.position, ds.value
       FROM study_sessions ss
       JOIN derived_scores ds ON ds.session_id = ss.id AND ds.metric_name = $2 AND ds.response_id IS NOT NULL
       JOIN responses r ON r.id = ds.response_id
       JOIN assessment_items i ON i.id = r.item_id
       JOIN assessments a ON a.id = ds.assessment_id
      WHERE ss.study_id = $1 AND ${IN_SCOPE}
      ORDER BY ds.session_id, r.item_id, r.attempt DESC, ds.computed_at DESC`,
    [studyId, ITEM_METRIC],
  );
  return r.rows.map((x) => ({
    conditionId: x.condition_id,
    assessmentCode: x.code,
    assessmentVersion: Number(x.version),
    assessmentKind: x.kind,
    itemKey: x.item_key,
    position: Number(x.position),
    value: x.value === null ? null : Number(x.value),
  }));
}

export async function loadTraditionItemRows(q: Q, studyId: string): Promise<TraditionItemRow[]> {
  const r = await q.query<{ condition_id: string; session_id: string; kind: string; slug: string; name: string; value: number | null }>(
    `SELECT x.condition_id, x.session_id, x.kind, t.slug, t.name, x.value
       FROM (SELECT DISTINCT ON (ds.session_id, r.item_id) ss.condition_id, ss.id AS session_id, a.kind::text AS kind, i.concept_id, ds.value
               FROM study_sessions ss
               JOIN derived_scores ds ON ds.session_id = ss.id AND ds.metric_name = $2 AND ds.response_id IS NOT NULL
               JOIN responses r ON r.id = ds.response_id
               JOIN assessment_items i ON i.id = r.item_id
               JOIN assessments a ON a.id = ds.assessment_id
              WHERE ss.study_id = $1 AND ${IN_SCOPE} AND a.kind IN ('pretest', 'posttest') AND i.concept_id IS NOT NULL
              ORDER BY ds.session_id, r.item_id, r.attempt DESC, ds.computed_at DESC) x
       JOIN concepts c ON c.id = x.concept_id
       JOIN traditions t ON t.id = c.tradition_id`,
    [studyId, ITEM_METRIC],
  );
  return r.rows.map((x) => ({
    conditionId: x.condition_id,
    sessionId: x.session_id,
    traditionSlug: x.slug,
    traditionName: x.name,
    kind: x.kind,
    value: x.value === null ? null : Number(x.value),
  }));
}
