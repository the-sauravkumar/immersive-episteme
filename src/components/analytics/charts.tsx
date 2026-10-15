"use client";

/**
 * Research-console charts (DESIGN.md 10: the dashboard reads as the results section of a paper).
 *
 *  - Every chart is a numbered <figure>: "Figure n. Title" above, a "How to read" line stating n,
 *    the measure, the unit and the uncertainty, then the plot, then a "Data table" disclosure
 *    with the same data as a booktabs table and an optional 44 px "Download CSV" button.
 *  - Forms: dot-and-interval strip plots for condition comparisons (every observation drawn),
 *    slope charts for pre to post, bars only for counts (from zero), heatmaps on the sequential
 *    indigo ramp with the value printed in every cell. No pie, no 3D, no dual axes, no gradients,
 *    no red/green pairs, no legends (direct labels instead, R-A13).
 *  - Encoding: 2D = --series-2d, circle marker, solid line; 3D = --series-3d, square marker,
 *    4-2 dashed line (R-A12). 2D is always first or left. Traditions are never colour-coded.
 *  - Style: Inter 12 --ink-3 axis labels (tabular), axis names Inter 14/500 --ink (two label
 *    levels, R-T18), 1 px --ink x axis, --grid y gridlines, plot area on --surface, no border,
 *    `animation: false`. No links inside a plot area.
 * Captions describe; they never use causal wording.
 */
import type { EChartsCoreOption } from "echarts/core";
import { ChevronRight, Download } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { fixed, niceScale, orderByCondition, type ConditionKind, type NiceScale } from "./encoding";
import { useEChart, type VizTheme } from "./use-echart";

// ---------------------------------------------------------------------------------------------
// Condition encoding
// ---------------------------------------------------------------------------------------------

export function seriesColour(t: VizTheme, kind: ConditionKind): string {
  return kind === "3d" ? t.series3d : kind === "2d" ? t.series2d : t.ink2;
}
const marker = (kind: ConditionKind) => (kind === "3d" ? "rect" : "circle");
const dash = (kind: ConditionKind): "solid" | number[] => (kind === "3d" ? [4, 2] : "solid");

// ---------------------------------------------------------------------------------------------
// Shared option pieces
// ---------------------------------------------------------------------------------------------

function valueAxis(t: VizTheme, name?: string, extra: Record<string, unknown> = {}) {
  return {
    type: "value",
    name,
    nameLocation: "middle",
    nameGap: 44,
    nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontSize: 12 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    ...extra,
  };
}

/**
 * Value-axis bounds and ticks from a NiceScale: one tick per interval, each printed with the
 * decimals the interval needs (never duplicated, never "-0.0").
 */
function scaleAxis(t: VizTheme, scale: NiceScale | null): Record<string, unknown> {
  if (!scale) return {};
  return {
    min: scale.min,
    max: scale.max,
    interval: scale.interval,
    axisLabel: { color: t.ink3, fontSize: 12, formatter: (v: number) => fixed(v, scale.decimals) },
  };
}

function baseAxis(t: VizTheme, extra: Record<string, unknown> = {}) {
  return {
    axisLine: { show: true, lineStyle: { color: t.ink, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: t.ink3, fontSize: 12 },
    splitLine: { show: false },
    ...extra,
  };
}

function grid(t: VizTheme, extra: Record<string, unknown> = {}) {
  return { left: 8, right: 16, top: 16, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "all", show: true, backgroundColor: t.surface, borderWidth: 0, ...extra };
}

function tooltip(t: VizTheme, extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: t.surface,
    borderColor: t.ink,
    borderWidth: 1,
    padding: [6, 8],
    textStyle: { color: t.ink, fontSize: 13 },
    extraCssText: "box-shadow:none;border-radius:2px;",
    ...extra,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Tooltip body as a booktabs mini-table (label / value rows). */
function miniTable(title: string, rows: [string, string][]): string {
  const cells = rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0">${esc(k)}</td><td style="padding:2px 0;text-align:right;font-variant-numeric:tabular-nums">${esc(v)}</td></tr>`)
    .join("");
  return `<div style="font-weight:600;margin-bottom:4px">${esc(title)}</div><table style="border-collapse:collapse;border-top:1.5px solid currentColor;border-bottom:1.5px solid currentColor">${cells}</table>`;
}


/** Deterministic horizontal offsets so equal values do not hide each other (no randomness). */
function jitter(j: number, spread = 0.16): number {
  return ((((j * 37) % 21) - 10) / 10) * spread;
}

// ---------------------------------------------------------------------------------------------
// Figure frame
// ---------------------------------------------------------------------------------------------

export type Cell = string | number | null;

export interface DataTableSpec {
  head: string[];
  rows: Cell[][];
  /** Indexes of numeric columns (right-aligned, tabular). Default: every column whose cells are all numbers or "–". */
  numeric?: number[];
}

const NUMERIC = /^[-−]?\d+(\.\d+)?$/;
const isNumericCell = (c: Cell) => c === null || typeof c === "number" || c === "–" || (typeof c === "string" && NUMERIC.test(c));

/** The figure's data, as a booktabs table (inside the disclosure). */
export function ChartDataTable({ spec, label }: { spec: DataTableSpec; label: string }) {
  const numeric = spec.numeric ?? spec.head.map((_, j) => (spec.rows.length > 0 && spec.rows.every((r) => isNumericCell(r[j] ?? null)) ? j : -1)).filter((j) => j >= 0);
  return (
    <Table label={label} density="compact">
      <TableHeader>
        <TableRow>
          {spec.head.map((h, j) => (
            <TableHead key={`${h}-${j}`} scope="col" numeric={numeric.includes(j)}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {spec.rows.map((r, i) => (
          <TableRow key={i}>
            {r.map((c, j) => (
              <TableCell key={j} numeric={numeric.includes(j)} className={numeric.includes(j) ? "whitespace-nowrap" : "whitespace-normal"}>
                {c === null ? "–" : c}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** A 44 px outline link-button that downloads a CSV (DESIGN.md 10). */
export function CsvButton({ href, label = "Download CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-control border border-rule-strong px-4 font-sans text-[0.9375rem] leading-5 font-medium text-ink hover:bg-sunk [&_svg]:size-5 [&_svg]:stroke-[1.75]"
    >
      <Download aria-hidden="true" />
      {label}
    </a>
  );
}

/** A cell as CSV text (RFC 4180 quoting; text that a spreadsheet would run as a formula is prefixed with '). */
function csvCell(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  let s = c === "–" ? "" : c;
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !NUMERIC.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The figure's data table as CSV text (header row first, CRLF line ends). */
export function tableCsv(spec: Pick<DataTableSpec, "head" | "rows">): string {
  return [spec.head, ...spec.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * "Download CSV" for data that has no server CSV route: builds the file from the table shown on
 * the page (same values, same pseudonymised codes). Callers render it only for staff allowed to
 * download (exports.create), exactly like the server CSV links.
 */
export function CsvDataButton({ filename, spec, label = "Download CSV" }: { filename: string; spec: Pick<DataTableSpec, "head" | "rows">; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([tableCsv(spec)], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }}
      className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-control border border-rule-strong px-4 font-sans text-[0.9375rem] leading-5 font-medium text-ink hover:bg-sunk [&_svg]:size-5 [&_svg]:stroke-[1.75]"
    >
      <Download aria-hidden="true" />
      {label}
    </button>
  );
}

/** "Data table" disclosure: 44 px summary, instant open (no transition). */
export function DataDisclosure({ children, label = "Data table" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group/data min-w-0">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-sans text-[0.9375rem] leading-5 font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 stroke-[1.75] group-open/data:rotate-90" />
        {label}
      </summary>
      <div className="mt-2 min-w-0">{children}</div>
    </details>
  );
}

export function ChartFigure({
  number,
  title,
  howToRead,
  height,
  label,
  chartRef,
  table,
  csvHref,
  csvFile,
  empty,
  className,
}: {
  number?: number;
  title: string;
  howToRead: ReactNode;
  height: number;
  /** Accessible name of the plot (defaults to the title). */
  label?: string;
  chartRef: Ref<HTMLDivElement>;
  table: DataTableSpec;
  csvHref?: string;
  /** Client-built CSV of the data table (file name), for data with no server CSV route. */
  csvFile?: string;
  /** Replaces the plot (not the caption) when there is nothing to draw. */
  empty?: ReactNode;
  className?: string;
}) {
  const heading = titleCase(title);
  // The accessible name of the plot: the figure number, then the authored label (title and values).
  const name = `${number !== undefined ? `Figure ${number}. ` : ""}${label ?? heading}`;
  return (
    <figure data-slot="chart-figure" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="flex flex-col gap-1">
        <span className="font-sans text-[0.9375rem] leading-6 text-ink">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </span>
        <span className="text-credit">{howToRead}</span>
      </figcaption>
      {empty ? (
        <div className="text-body flex min-h-24 items-center bg-sunk px-4 text-ink-2">{empty}</div>
      ) : (
        <div style={{ height }} className="min-w-0 [&_text]:tabular-nums">
          <div ref={chartRef} role="img" aria-label={name} className="h-full w-full" />
        </div>
      )}
      {empty ? null : (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <DataDisclosure>
            <ChartDataTable spec={table} label={`Data for ${number !== undefined ? `Figure ${number}` : heading}`} />
          </DataDisclosure>
          {csvHref ? <CsvButton href={csvHref} /> : csvFile ? <CsvDataButton filename={csvFile} spec={table} /> : null}
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Dot-and-interval strip plot (condition comparisons; small multiples on identical scales)
// ---------------------------------------------------------------------------------------------

export interface IntervalGroup {
  /** Direct label under the group, e.g. "2D". */
  name: string;
  kind: ConditionKind;
  values: number[];
  /** The interval drawn beside the points: centre (mean or median) and its low/high ends. */
  center: number | null;
  low: number | null;
  high: number | null;
}

export interface IntervalPanel {
  title: string;
  groups: IntervalGroup[];
}

/** One y scale for every panel (small multiples on identical scales). */
export function intervalScale(panels: IntervalPanel[], zero: boolean): NiceScale | null {
  return niceScale(
    panels.flatMap((p) => p.groups.flatMap((g) => [...g.values, g.low, g.high])),
    zero,
  );
}

/**
 * The direct label printed under a group (R-A13): the condition key ("2D", "3D"; any other group
 * by name) and its n, e.g. "2D (n = 4)". Full condition names did not fit side by side under a
 * small multiple; they are in the caption's n line, the tooltip and the data table.
 */
export const groupLabel = (g: Pick<IntervalGroup, "name" | "kind" | "values">) => `${g.kind === "2d" ? "2D" : g.kind === "3d" ? "3D" : g.name} (n = ${g.values.length})`;

function IntervalPanelChart({
  figure,
  panel,
  scale,
  unit,
  digits,
  height,
  intervalName,
  centerName,
}: {
  /** "Figure n. Title", the start of the plot's accessible name. */
  figure: string;
  panel: IntervalPanel;
  scale: NiceScale | null;
  unit?: string;
  digits: number;
  height: number;
  intervalName: string;
  centerName: string;
}) {
  const groups = orderByCondition(panel.groups);
  // On an axis pinned at zero (durations) an interval end below zero is drawn at the axis; the
  // tooltip and the data table keep the computed value.
  const floor = scale && scale.min === 0 ? 0 : -Infinity;
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      grid: grid(t, { left: 4, right: 12, top: 12, bottom: 4 }),
      tooltip: tooltip(t, { trigger: "item" }),
      xAxis: {
        type: "value",
        min: -0.5,
        max: groups.length - 0.5,
        ...baseAxis(t),
        // Direct labels under each group (R-A13): labels only at the group centres 0..n-1.
        axisLabel: {
          color: t.ink,
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 16,
          customValues: groups.map((_, i) => i),
          formatter: (v: number) => (groups[v] ? groupLabel(groups[v]) : ""),
          width: 120,
          overflow: "break",
        },
      },
      yAxis: valueAxis(t, unit, scaleAxis(t, scale)),
      series: groups.flatMap((g, i) => {
        const colour = seriesColour(t, g.kind);
        const x = i + 0.24;
        const out: Record<string, unknown>[] = [
          {
            type: "scatter",
            name: `${g.name}: observations`,
            symbol: marker(g.kind),
            symbolSize: 7,
            itemStyle: { color: colour, opacity: 0.6, borderColor: t.surface, borderWidth: 1 },
            data: g.values.map((v, j) => [i - 0.12 + jitter(j, 0.1), v]),
            tooltip: { formatter: (p: { value: [number, number] }) => miniTable(g.name, [["Value", fixed(p.value[1], digits)]]) },
            z: 2,
          },
        ];
        if (g.low !== null && g.high !== null) {
          out.push({
            type: "line",
            name: `${g.name}: ${intervalName}`,
            data: [
              [x, Math.max(floor, g.low)],
              [x, Math.max(floor, g.high)],
            ],
            symbol: "none",
            lineStyle: { color: colour, width: 1.75, type: dash(g.kind) },
            tooltip: { show: false },
            silent: true,
            z: 3,
          });
        }
        if (g.center !== null) {
          out.push({
            type: "scatter",
            name: `${g.name}: ${centerName}`,
            symbol: marker(g.kind),
            symbolSize: 12,
            itemStyle: { color: colour, borderColor: t.ink, borderWidth: 1.5 },
            data: [[x, g.center]],
            tooltip: {
              formatter: () =>
                miniTable(g.name, [
                  [titleCase(centerName), fixed(g.center, digits)],
                  [intervalName, g.low === null ? "–" : `${fixed(g.low, digits)} to ${fixed(g.high, digits)}`],
                  ["n", String(g.values.length)],
                ]),
            },
            z: 4,
          });
        }
        return out;
      }),
    }),
    [JSON.stringify({ groups, scale, unit, digits })],
  );
  const values = groups
    .map((g) => `${g.name}, n = ${g.values.length}: ${centerName} ${fixed(g.center, digits)}${g.low === null ? "" : `, ${intervalName} ${fixed(g.low, digits)} to ${fixed(g.high, digits)}`}`)
    .join("; ");
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {panel.title ? <p className="font-sans text-[0.875rem] leading-5 font-medium text-ink">{titleCase(panel.title)}</p> : null}
      <div style={{ height }} className="min-w-0 [&_text]:tabular-nums">
        <div ref={ref} role="img" aria-label={`${figure}${panel.title ? `, ${titleCase(panel.title)}` : ""}: ${values}.`} className="h-full w-full" />
      </div>
    </div>
  );
}

/**
 * Dot-and-interval strip plot. One panel, or small multiples on identical y scales. Every
 * observation is a point; the larger marker is the centre with its interval drawn beside it.
 */
export function DotIntervalChart({
  number,
  title,
  howToRead,
  panels,
  unit,
  digits = 2,
  zero = false,
  height = 260,
  intervalName = "95% CI",
  centerName = "mean",
  csvHref,
  csvFile,
  empty,
}: {
  number?: number;
  title: string;
  howToRead: ReactNode;
  panels: IntervalPanel[];
  unit?: string;
  digits?: number;
  /** Pin the y scale at zero (durations, counts); interval ends below zero are drawn at the axis. */
  zero?: boolean;
  height?: number;
  intervalName?: string;
  centerName?: string;
  csvHref?: string;
  /** Client-built CSV of the data table (file name), for data with no server CSV route. */
  csvFile?: string;
  empty?: ReactNode;
}) {
  const scale = intervalScale(panels, zero);
  const heading = titleCase(title);
  const figure = `${number !== undefined ? `Figure ${number}. ` : ""}${heading}`;
  const hasData = panels.some((p) => p.groups.some((g) => g.values.length > 0));
  const table: DataTableSpec = {
    head: [...(panels.length > 1 ? ["Panel"] : []), "Condition", "n", titleCase(centerName), `${intervalName} low`, `${intervalName} high`],
    rows: panels.flatMap((p) =>
      orderByCondition(p.groups).map((g) => [...(panels.length > 1 ? [p.title] : []), g.name, g.values.length, fixed(g.center, digits), fixed(g.low, digits), fixed(g.high, digits)]),
    ),
  };
  return (
    <figure data-slot="chart-figure" className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span className="font-sans text-[0.9375rem] leading-6 text-ink">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </span>
        <span className="text-credit">{howToRead}</span>
      </figcaption>
      {!hasData ? (
        <div className="text-body flex min-h-24 items-center bg-sunk px-4 text-ink-2">{empty ?? "No observations yet."}</div>
      ) : (
        <>
          <div className={cn("grid min-w-0 gap-4", panels.length > 1 && "sm:grid-cols-2 lg:grid-cols-3")}>
            {panels.map((p) => (
              <IntervalPanelChart key={p.title} figure={figure} panel={p} scale={scale} unit={panels.length > 1 ? undefined : unit} digits={digits} height={height} intervalName={intervalName} centerName={centerName} />
            ))}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <DataDisclosure>
              <ChartDataTable spec={table} label={`Data for ${number !== undefined ? `Figure ${number}` : heading}`} />
            </DataDisclosure>
            {csvHref ? <CsvButton href={csvHref} /> : csvFile ? <CsvDataButton filename={csvFile} spec={table} /> : null}
          </div>
        </>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------------------------
// Slope chart (pre to post)
// ---------------------------------------------------------------------------------------------

export interface SlopeLine {
  /** Participant code (tooltip and data table only). */
  id: string;
  condition: string;
  kind: ConditionKind;
  pre: number;
  post: number;
}

export function SlopeChart({
  number,
  title,
  howToRead,
  lines,
  unit,
  digits = 2,
  height = 300,
  preLabel = "Pre-test",
  postLabel = "Post-test",
  csvHref,
  empty,
}: {
  number?: number;
  title: string;
  howToRead: ReactNode;
  lines: SlopeLine[];
  unit?: string;
  digits?: number;
  height?: number;
  preLabel?: string;
  postLabel?: string;
  csvHref?: string;
  empty?: ReactNode;
}) {
  const ordered = orderByCondition(lines);
  const conditions = orderByCondition([...new Map(ordered.map((l) => [l.condition, { name: l.condition, kind: l.kind }])).values()]);
  const meanOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const means = conditions.map((c) => {
    const own = ordered.filter((l) => l.condition === c.name);
    return { ...c, n: own.length, pre: meanOf(own.map((l) => l.pre)), post: meanOf(own.map((l) => l.post)) };
  });
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      grid: grid(t, { left: 4, right: 104, top: 16, bottom: 4 }),
      tooltip: tooltip(t, { trigger: "item" }),
      xAxis: { type: "category", data: [preLabel, postLabel], boundaryGap: false, ...baseAxis(t), axisLabel: { color: t.ink, fontSize: 12, fontWeight: 500 } },
      yAxis: valueAxis(t, unit, scaleAxis(t, niceScale(ordered.flatMap((l) => [l.pre, l.post])))),
      series: [
        ...ordered.map((l) => ({
          type: "line",
          name: `${l.condition} ${l.id}`,
          data: [l.pre, l.post],
          symbol: marker(l.kind),
          symbolSize: 5,
          lineStyle: { color: seriesColour(t, l.kind), width: 1, type: dash(l.kind), opacity: 0.45 },
          itemStyle: { color: seriesColour(t, l.kind), opacity: 0.6 },
          tooltip: { formatter: () => miniTable(`${l.condition} · ${l.id}`, [[preLabel, fixed(l.pre, digits)], [postLabel, fixed(l.post, digits)], ["Change", fixed(l.post - l.pre, digits)]]) },
          z: 2,
        })),
        ...means
          .filter((m) => m.pre !== null && m.post !== null)
          .map((m) => ({
            type: "line",
            name: `${m.name} mean`,
            data: [m.pre, m.post],
            symbol: marker(m.kind),
            symbolSize: 11,
            lineStyle: { color: seriesColour(t, m.kind), width: 2.5, type: dash(m.kind) },
            itemStyle: { color: seriesColour(t, m.kind), borderColor: t.ink, borderWidth: 1.5 },
            endLabel: { show: true, formatter: `${m.name} mean`, color: t.ink, fontSize: 12, fontWeight: 500, distance: 8 },
            tooltip: { formatter: () => miniTable(`${m.name} mean (n = ${m.n})`, [[preLabel, fixed(m.pre, digits)], [postLabel, fixed(m.post, digits)]]) },
            z: 4,
          })),
      ],
    }),
    [JSON.stringify({ ordered, unit, digits, preLabel, postLabel })],
  );
  return (
    <ChartFigure
      number={number}
      title={title}
      howToRead={howToRead}
      height={height}
      chartRef={ref}
      label={`${titleCase(title)}: ${means.map((m) => `${m.name} mean ${fixed(m.pre, digits)} to ${fixed(m.post, digits)}, n = ${m.n}`).join("; ")}`}
      csvHref={csvHref}
      empty={lines.length === 0 ? (empty ?? "No participant has both scores yet.") : undefined}
      table={{
        head: ["Participant", "Condition", preLabel, postLabel, "Change"],
        rows: ordered.map((l) => [l.id, l.condition, fixed(l.pre, digits), fixed(l.post, digits), fixed(l.post - l.pre, digits)]),
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Count bars (counts only, always from zero)
// ---------------------------------------------------------------------------------------------

export interface CountSeries {
  name: string;
  kind: ConditionKind;
  values: number[];
  /** Per-bar condition, when the categories are the conditions (one bar per condition). */
  kinds?: ConditionKind[];
}

/** Bars for counts. Grouped by category, one bar per condition, each bar labelled directly. */
export function CountBars({
  number,
  title,
  howToRead,
  categories,
  series,
  unit,
  height = 260,
  csvHref,
}: {
  number?: number;
  title: string;
  howToRead: ReactNode;
  categories: string[];
  series: CountSeries[];
  unit: string;
  height?: number;
  csvHref?: string;
}) {
  const ordered = orderByCondition(series);
  const single = ordered.length === 1;
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      grid: grid(t, { top: single ? 24 : 40 }),
      tooltip: tooltip(t, { trigger: "item" }),
      xAxis: { type: "category", data: categories, ...baseAxis(t), axisLabel: { color: t.ink, fontSize: 12, fontWeight: 500, interval: 0, overflow: "break", width: 96 } },
      yAxis: valueAxis(t, unit, { min: 0, minInterval: 1 }),
      series: ordered.map((s) => ({
        type: "bar",
        name: s.name,
        // Each bar is encoded by its own condition (2D solid, 3D dashed outline); a zero bar has
        // no outline, so nothing is drawn under its label.
        data: s.values.map((v, i) => {
          const kind = s.kinds?.[i] ?? s.kind;
          return { value: v, itemStyle: { color: seriesColour(t, kind), borderColor: t.ink, borderWidth: kind === "3d" && v > 0 ? 1.5 : 0, borderType: kind === "3d" ? [4, 2] : "solid" } };
        }),
        barMaxWidth: 32,
        barGap: "12%",
        // Direct labels (R-A13) that fit over a grouped bar: the value, and under several series a
        // short condition key on a second line ("2D" / "3D"); full names are in the tooltip, the
        // caption and the data table. Long names side by side overprinted each other.
        label: {
          show: true,
          position: "top",
          color: t.ink,
          fontSize: 12,
          lineHeight: 14,
          formatter: (p: { value: number }) => (single ? String(p.value) : `${p.value}\n${s.kind === "2d" ? "2D" : s.kind === "3d" ? "3D" : s.name}`),
        },
        tooltip: { formatter: (p: { name: string; value: number }) => miniTable(p.name, [[s.name, `${p.value} ${unit}`]]) },
      })),
    }),
    [JSON.stringify({ categories, ordered, unit })],
  );
  return (
    <ChartFigure
      number={number}
      title={title}
      howToRead={howToRead}
      height={height}
      chartRef={ref}
      csvHref={csvHref}
      label={`${titleCase(title)}: ${categories.map((c, i) => (single ? `${c}, ${ordered[0]!.values[i] ?? 0} ${unit}` : `${c}, ${ordered.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(", ")}`)).join("; ")}.`}
      table={{ head: ["", ...ordered.map((s) => s.name)], rows: categories.map((c, i) => [c, ...ordered.map((s) => s.values[i] ?? 0)]) }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Heatmap (sequential indigo ramp, value printed in every cell)
// ---------------------------------------------------------------------------------------------

/** Ramp step 0-5 for a count (0 is always the lightest step). */
export function rampStep(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
}

/** Transition matrix heatmap (from row category to column category). */
export function TransitionHeatmap({ number, title, howToRead, labels, counts }: { number?: number; title: string; howToRead?: ReactNode; labels: string[]; counts: number[][] }) {
  const keep = labels.map((_, i) => counts[i]!.some((v) => v > 0) || counts.some((r) => (r[i] ?? 0) > 0));
  const idx = labels.map((_, i) => i).filter((i) => keep[i]);
  const shown = idx.map((i) => labels[i]!);
  const data = idx.flatMap((r, y) => idx.map((c, x) => [x, y, counts[r]![c]!] as [number, number, number]));
  const max = Math.max(1, ...data.map((d) => d[2]));
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      tooltip: tooltip(t, { formatter: (p: { value: [number, number, number] }) => miniTable(`${shown[p.value[1]]} → ${shown[p.value[0]]}`, [["Transitions", String(p.value[2])]]) }),
      grid: { left: 8, right: 16, top: 8, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "all", show: false },
      xAxis: { type: "category", data: shown, name: "To", nameLocation: "middle", nameGap: 0, position: "top", ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.ink3, fontSize: 12, rotate: 45, interval: 0 }, nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 }, splitArea: { show: false } },
      yAxis: { type: "category", data: shown, name: "From", inverse: true, ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.ink3, fontSize: 12, interval: 0 }, nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 } },
      series: [
        {
          type: "heatmap",
          data: data.map(([x, y, v]) => {
            const step = rampStep(v, max);
            return { value: [x, y, v], itemStyle: { color: t.ramp[step], borderColor: t.surface, borderWidth: 2 }, label: { show: true, color: t.rampLabel[step], fontSize: 12 } };
          }),
          label: { show: true },
          emphasis: { disabled: true },
        },
      ],
    }),
    [JSON.stringify({ labels, counts })],
  );
  const heading = titleCase(title);
  if (shown.length === 0)
    return (
      <figure className="flex min-w-0 flex-col gap-2">
        <figcaption className="font-sans text-[0.9375rem] leading-6 text-ink">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </figcaption>
        <p className="text-body bg-sunk px-4 py-3 text-ink-2">No transitions recorded yet.</p>
      </figure>
    );
  return (
    <ChartFigure
      number={number}
      title={title}
      howToRead={howToRead ?? "Rows are where the participant came from, columns where they went next; every cell prints its count, and a darker cell means more transitions."}
      height={Math.max(280, 120 + shown.length * 34)}
      chartRef={ref}
      table={{ head: ["From \\ to", ...shown], rows: idx.map((r) => [labels[r]!, ...idx.map((c) => counts[r]![c]!)]) }}
    />
  );
}

/**
 * A value heatmap (rows by columns) on the sequential indigo ramp, every cell printing its value
 * ("–" when undefined, on the lightest step). Rows keep the given order (callers pass 2D first);
 * columns keep the given order (callers pass the canonical layer order).
 */
export function ValueHeatmap({
  number,
  title,
  howToRead,
  rowLabels,
  colLabels,
  values,
  digits = 1,
  valueName,
  rowName,
  colName,
  csvHref,
  csvFile,
  empty,
}: {
  number?: number;
  title: string;
  howToRead: ReactNode;
  rowLabels: string[];
  colLabels: string[];
  values: (number | null)[][];
  digits?: number;
  /** What a cell holds, for the tooltip and data table, e.g. "Mean minutes per session". */
  valueName: string;
  rowName?: string;
  colName?: string;
  csvHref?: string;
  csvFile?: string;
  empty?: ReactNode;
}) {
  const cells = rowLabels.flatMap((_, y) => colLabels.map((_, x) => [x, y, values[y]?.[x] ?? null] as [number, number, number | null]));
  const max = Math.max(0, ...cells.map((c) => c[2] ?? 0));
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      tooltip: tooltip(t, {
        formatter: (p: { data: { value: [number, number, number]; shown: string } }) => miniTable(`${rowLabels[p.data.value[1]]} · ${colLabels[p.data.value[0]]}`, [[valueName, p.data.shown]]),
      }),
      grid: { left: 8, right: 16, top: colName ? 28 : 8, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "all", show: false },
      xAxis: {
        type: "category",
        data: colLabels,
        name: colName,
        nameLocation: "middle",
        nameGap: 24,
        position: "top",
        ...baseAxis(t),
        axisLine: { show: false },
        axisLabel: { color: t.ink, fontSize: 12, fontWeight: 500, interval: 0 },
        nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 },
      },
      yAxis: { type: "category", data: rowLabels, name: rowName, inverse: true, ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.ink, fontSize: 12, fontWeight: 500, interval: 0 }, nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 } },
      series: [
        {
          type: "heatmap",
          data: cells.map(([x, y, v]) => {
            const step = v === null ? 0 : rampStep(v, max);
            const shown = fixed(v, digits);
            return { value: [x, y, v ?? 0], shown, itemStyle: { color: t.ramp[step], borderColor: t.surface, borderWidth: 2 }, label: { show: true, color: t.rampLabel[step], fontSize: 12, formatter: () => shown } };
          }),
          emphasis: { disabled: true },
        },
      ],
    }),
    [JSON.stringify({ rowLabels, colLabels, values, digits })],
  );
  const heading = titleCase(title);
  return (
    <ChartFigure
      number={number}
      title={title}
      howToRead={howToRead}
      height={Math.max(160, 72 + rowLabels.length * 48)}
      chartRef={ref}
      csvHref={csvHref}
      csvFile={csvFile}
      empty={empty}
      label={`${heading}: ${rowLabels.map((r, y) => `${r} ${colLabels.map((c, x) => `${c} ${fixed(values[y]?.[x], digits)}`).join(", ")}`).join("; ")}`}
      table={{ head: [rowName ?? "", ...colLabels], rows: rowLabels.map((r, y) => [r, ...colLabels.map((_, x) => fixed(values[y]?.[x], digits))]) }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Interaction timeline
// ---------------------------------------------------------------------------------------------

export interface TimelinePointView {
  seq: number;
  tMs: number;
  lane: string;
  label: string;
}

/** Interaction timeline: one lane per analytic concept, time on x (seconds since the first event). */
export function InteractionTimeline({ number, title, points, kind = "other" }: { number?: number; title: string; points: TimelinePointView[]; kind?: ConditionKind }) {
  const lanes = [...new Set(points.map((p) => p.lane))];
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      tooltip: tooltip(t, { formatter: (p: { data: { label: string; value: [number, number] } }) => miniTable(p.data.label, [["Seconds", fixed(p.data.value[0], 1)]]) }),
      grid: grid(t, { bottom: 32 }),
      xAxis: { type: "value", name: "Seconds since the first event", nameLocation: "middle", nameGap: 28, ...baseAxis(t), nameTextStyle: { color: t.ink, fontSize: 14, fontWeight: 500 } },
      yAxis: { type: "category", data: lanes, ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.ink3, fontSize: 12, interval: 0 }, splitLine: { show: true, lineStyle: { color: t.grid } } },
      series: [
        {
          type: "scatter",
          symbol: marker(kind),
          symbolSize: 8,
          itemStyle: { color: seriesColour(t, kind), borderColor: t.surface, borderWidth: 1 },
          data: points.map((p) => ({ value: [p.tMs / 1000, lanes.indexOf(p.lane)], label: `#${p.seq} ${p.label}` })),
        },
      ],
    }),
    [JSON.stringify({ points, kind })],
  );
  if (points.length === 0) return <p className="text-body bg-sunk px-4 py-3 text-ink-2">No events recorded for this session.</p>;
  return (
    <ChartFigure
      number={number}
      title={title}
      howToRead={`Each point is one event (n = ${points.length}); lanes are the condition-neutral analytic concepts, so 2D and 3D sessions read alike.`}
      height={Math.max(220, 70 + lanes.length * 30)}
      chartRef={ref}
      table={{ head: ["Seq", "Seconds", "Event", "Detail"], rows: points.map((p) => [p.seq, fixed(p.tMs / 1000, 1), p.lane, p.label]) }}
    />
  );
}
