import { inCanonicalOrder } from "@/features/learning/labels";
import type { Q } from "@/server/research/db";

export const ITEM_METRIC = "item.key_match";

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
  byCondition: { n: number; undefined: number; correct: number | null }[];
}

const KIND_ORDER: Record<string, number> = { pretest: 0, posttest: 1, transfer: 2 };

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
  kind: string;
  value: number | null;
}

export interface TraditionGain {
  slug: string;
  name: string;
  gains: number[][];
}

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

const IN_SCOPE = "ss.condition_id IS NOT NULL AND NOT ss.excluded AND NOT ss.withdrawn";

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
