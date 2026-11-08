import { ITEM_METRIC, itemStatistics, loadItemScoreRows, loadTraditionItemRows, traditionGains } from "@/app/(research)/research/dashboard/_components/dashboard-extras";
import { KEY_MATCH_METRIC } from "@/features/assessment/responses";
import { describe } from "@/features/research/descriptive";
import { DASHBOARD_METRICS_VERSION } from "@/features/research/metric-definitions";

import type { DashboardData } from "./dashboard";
import type { Q } from "./db";
import { toCsv } from "./exports/csv";
import { DASHBOARD_EXTRA_TABLE_BY_NAME, type DashboardExtraTableName } from "./exports/dictionary";

const round = (v: number | null, digits = 6) => (v === null ? null : Number(v.toFixed(digits)));

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
    case "dashboard_items": {
      const items = itemStatistics(await loadItemScoreRows(q, data.study.id), ids);
      const rows = items.flatMap((it) =>
        it.byCondition.map((c, i) => ({ assessment: it.assessment, kind: it.kind, item_key: it.itemKey, position: it.position, condition_code: cond(i).code, condition_interface: cond(i).interface, n: c.n, undefined: c.undefined, correct: round(c.correct) })),
      );
      return { rows, metrics: `${ITEM_METRIC}@${KEY_MATCH_METRIC.version}` };
    }
  }
}

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
