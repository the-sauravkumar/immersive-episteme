import { Fragment, type ReactNode } from "react";

import { conditionKind, fixed } from "@/components/analytics/encoding";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_BY_KEY, metricRole } from "@/features/research/metric-definitions";
import type { ConditionRef } from "@/server/research/analytics";
import type { MeasureRow } from "@/server/research/dashboard";

/** A number with fixed decimals, or an en dash when undefined (never "-0.00"). */
export function num(v: number | null | undefined, digits = 3): string {
  return fixed(v, digits);
}

/**
 * A metric key or code that may wrap only after its separators ('.', '_', '/', '-'), never inside
 * a word: a <wbr> follows each separator, and the cell uses overflow-wrap:break-word (not
 * break-all), so "time.exposure_total_ms" breaks as "time.exposure_" / "total_ms".
 */
export function breakableKey(key: string): ReactNode {
  const parts = key.split(/(?<=[._/-])/);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? <wbr /> : null}
    </Fragment>
  ));
}

const PHASE: Record<string, string> = { pre: "Pre", post: "Post", change: "Change", session: "Per session" };

/** Conditions with 2D first (DESIGN.md 10: 2D is always first or left). */
export function conditionOrder(conditions: ConditionRef[]): (id: string) => number {
  const rank = new Map(
    conditions
      .map((c, i) => ({ id: c.id, k: conditionKind(c.interface), i }))
      .sort((a, b) => (a.k === b.k ? a.i - b.i : a.k === "2d" ? -1 : b.k === "2d" ? 1 : a.k === "3d" ? -1 : 1))
      .map((c, i) => [c.id, i]),
  );
  return (id) => rank.get(id) ?? 99;
}

/**
 * Descriptive booktabs table: one row per measure, phase and condition (n, missing, mean, SD,
 * median, 95% CI), numbers right-aligned with tabular figures and fixed decimals per column.
 */
export function StatsTable({ rows, conditions, digits = 3, caption, number }: { rows: MeasureRow[]; conditions: ConditionRef[]; digits?: number; caption: string; number?: number }) {
  const label = (id: string) => conditions.find((c) => c.id === id)?.label ?? id;
  const rank = conditionOrder(conditions);
  return (
    <Table caption={caption} number={number} hoverRows>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Measure</TableHead>
          <TableHead scope="col">Phase</TableHead>
          <TableHead scope="col">Condition</TableHead>
          <TableHead scope="col" numeric>
            n
          </TableHead>
          <TableHead scope="col" numeric>
            Missing
          </TableHead>
          <TableHead scope="col" numeric>
            Mean
          </TableHead>
          <TableHead scope="col" numeric>
            SD
          </TableHead>
          <TableHead scope="col" numeric>
            Median
          </TableHead>
          <TableHead scope="col" numeric>
            95% CI
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.flatMap((m) =>
          [...m.byCondition]
            .sort((a, b) => rank(a.conditionId) - rank(b.conditionId))
            .map((c, i) => (
              <TableRow key={`${m.key}|${m.phase}|${m.label ?? ""}|${c.conditionId}`}>
                <TableCell className="w-56 min-w-44 align-top whitespace-normal">
                  {i === 0 ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{METRIC_BY_KEY.get(m.key)?.label ?? m.key}</span>
                      <span className="text-id text-ink-3 [overflow-wrap:break-word]">
                        {breakableKey(m.key)} v{m.version}, {metricRole(m.key)}
                        {m.label ? `, ${m.label}` : ""}
                      </span>
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="align-top">{i === 0 ? (PHASE[m.phase] ?? m.phase) : null}</TableCell>
                <TableCell>{label(c.conditionId)}</TableCell>
                <TableCell numeric>{c.stats.n}</TableCell>
                <TableCell numeric>{c.stats.missing}</TableCell>
                <TableCell numeric>{num(c.stats.mean, digits)}</TableCell>
                <TableCell numeric>{num(c.stats.sd, digits)}</TableCell>
                <TableCell numeric>{num(c.stats.median, digits)}</TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {c.stats.ciLow === null ? "–" : `${num(c.stats.ciLow, digits)} to ${num(c.stats.ciHigh, digits)}`}
                </TableCell>
              </TableRow>
            )),
        )}
      </TableBody>
    </Table>
  );
}
