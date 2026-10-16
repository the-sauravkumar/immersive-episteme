/**
 * Server CSV of the dashboard's rows 3 and 4 (DESIGN.md 11.9): Figure 3 "Gain by Tradition"
 * (DR-035), Figure 4 "Dwell Time per Layer" and Table 2 "Per-Item Statistics". The same stored
 * derived values and the same pure aggregations the dashboard draws
 * (src/app/(research)/research/dashboard/_components/dashboard-extras.ts), written with the same
 * `#` header line as the other dashboard tables: study, demo status, server time, dashboard
 * version and the metric versions. Pseudonymised (no participant identifier at all: aggregates).
 */
import { LAYER_COLUMNS, LAYER_METRIC, ITEM_METRIC, itemStatistics, layerDwell, loadItemScoreRows, loadLayerMetricRows, loadTraditionItemRows, traditionGains } from "@/app/(research)/research/dashboard/_components/dashboard-extras";
import { KEY_MATCH_METRIC } from "@/features/assessment/responses";
import { describe } from "@/features/research/descriptive";
import { DASHBOARD_METRICS_VERSION } from "@/features/research/metric-definitions";
import { TIMING_METRICS_VERSION } from "@/features/telemetry/metrics";

import type { DashboardData } from "./dashboard";
import type { Q } from "./db";
import { toCsv } from "./exports/csv";
import { DASHBOARD_EXTRA_TABLE_BY_NAME, type DashboardExtraTableName } from "./exports/dictionary";

const round = (v: number | null, digits = 6) => (v === null ? null : Number(v.toFixed(digits)));

/** Rows of one extra table, in dictionary column order, and the metric versions it reads. */
export async function dashboardExtraTableRows(q: Q, data: DashboardData, table: DashboardExtraTableName): Promise<{ rows: Record<string, unknown>[]; metrics: string }> {
  const ids = data.conditions.map((c) => c.id);
  const cond = (i: number) => data.conditions[i]!;
  switch (table) {
    case "dashboard_tradition_gain": {
      const gains = traditionGains(await loadTraditionItemRows(q, data.study.id), ids);
      const rows = gains.flatMap((t) =>
        t.gains.map((values, i) => {
          const s = describe(values);
          return { tradition_slug: t.slug, tradition: t.name, condition_code: cond(i).code, condition_interface: cond(i).interface, n: s.n, mean: round(s.mean), sd: round(s.sd), median: round(s.median), ci95_low: round(s.ciLow), ci95_high: round(s.ciHigh) };
        }),
      );
      return { rows, metrics: `${ITEM_METRIC}@${KEY_MATCH_METRIC.version}` };
    }
    case "dashboard_dwell": {
      const dwell = layerDwell(await loadLayerMetricRows(q, data.study.id), ids);
      const rows = dwell.conditions.flatMap((_, i) =>
        LAYER_COLUMNS.map((col, li) => ({ condition_code: cond(i).code, condition_interface: cond(i).interface, layer: col.id, sessions: dwell.n[i], mean_minutes: round(dwell.meanMinutes[i]?.[li] ?? null), metric_versions: dwell.versions.join(" ") })),
      );
      const stored = dwell.versions.length > 0 ? dwell.versions.join(",") : TIMING_METRICS_VERSION;
      return { rows, metrics: `${LAYER_METRIC}@${stored}` };
    }
    case "dashboard_items": {
      const items = itemStatistics(await loadItemScoreRows(q, data.study.id), ids);
      const rows = items.flatMap((it) =>
        it.byCondition.map((c, i) => ({ assessment: it.assessment, kind: it.kind, item_key: it.itemKey, position: it.position, condition_code: cond(i).code, condition_interface: cond(i).interface, n: c.n, undefined: c.undefined, correct: round(c.correct) })),
      );
      return { rows, metrics: `${ITEM_METRIC}@${KEY_MATCH_METRIC.version}` };
    }
  }
}

/** One extra dashboard table as CSV, with the dashboard's `#` header line. */
export async function dashboardExtraTableCsv(q: Q, data: DashboardData, table: DashboardExtraTableName): Promise<string> {
  const spec = DASHBOARD_EXTRA_TABLE_BY_NAME.get(table)!;
  const { rows, metrics } = await dashboardExtraTableRows(q, data, table);
  const header = [
    `# immersive-episteme dashboard table ${table}`,
    `study=${data.study.slug}`,
    `non_experimental=${data.study.nonExperimental}`,
    `generated_at=${data.generatedAt}`,
    `dashboard_version=${DASHBOARD_METRICS_VERSION}`,
    `metric versions: ${metrics}`,
  ].join("; ");
  return `${header}\r\n${toCsv(rows, spec.columns.map((c) => c.name))}`;
}
