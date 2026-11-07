"use client";

import type { EChartsCoreOption } from "echarts/core";
import { Download } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

import { fixed, niceScale, orderByCondition, type ConditionKind, type NiceScale } from "./encoding";
import { useEChart, type VizTheme } from "./use-echart";
import { Disclosure } from "@/components/ui/disclosure";


export function seriesColour(t: VizTheme, kind: ConditionKind): string {
  return kind === "3d" ? t.series3d : kind === "2d" ? t.series2d : t.textDim;
}
const marker = (kind: ConditionKind) => (kind === "3d" ? "rect" : "circle");
const dash = (kind: ConditionKind): "solid" | number[] => (kind === "3d" ? [4, 2] : "solid");


function valueAxis(t: VizTheme, name?: string, extra: Record<string, unknown> = {}) {
  return {
    type: "value",
    name,
    nameLocation: "middle",
    nameGap: 44,
    nameTextStyle: { color: t.text, fontSize: 15, fontWeight: 600 },
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.textDim, fontSize: 13 },
    splitLine: { lineStyle: { color: t.line, width: 1 } },
    ...extra,
  };
}

function scaleAxis(t: VizTheme, scale: NiceScale | null): Record<string, unknown> {
  if (!scale) return {};
  return {
    min: scale.min,
    max: scale.max,
    interval: scale.interval,
    axisLabel: { color: t.textDim, fontSize: 13, formatter: (v: number) => fixed(v, scale.decimals) },
  };
}

function baseAxis(t: VizTheme, extra: Record<string, unknown> = {}) {
  return {
    axisLine: { show: true, lineStyle: { color: t.text, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: t.textDim, fontSize: 13 },
    splitLine: { show: false },
    ...extra,
  };
}

function grid(t: VizTheme, extra: Record<string, unknown> = {}) {
  return { left: 8, right: 16, top: 16, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "all", show: true, backgroundColor: t.page, borderWidth: 0, ...extra };
}

function tooltip(t: VizTheme, extra: Record<string, unknown> = {}) {
  return {
    backgroundColor: t.page,
    borderColor: t.text,
    borderWidth: 1,
    padding: [6, 8],
    textStyle: { color: t.text, fontSize: 13 },
    extraCssText: "box-shadow:none;border-radius:0;",
    ...extra,
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function miniTable(title: string, rows: [string, string][]): string {
  const cells = rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0">${esc(k)}</td><td style="padding:2px 0;text-align:right;font-variant-numeric:tabular-nums">${esc(v)}</td></tr>`)
    .join("");
  return `<div style="font-weight:600;margin-bottom:4px">${esc(title)}</div><table style="border-collapse:collapse;border-top:1.5px solid currentColor;border-bottom:1.5px solid currentColor">${cells}</table>`;
}


function jitter(j: number, spread = 0.16): number {
  return ((((j * 37) % 21) - 10) / 10) * spread;
}


export type Cell = string | number | null;

export interface DataTableSpec {
  head: string[];
  rows: Cell[][];
  numeric?: number[];
}

const NUMERIC = /^[-−]?\d+(\.\d+)?$/;
const isNumericCell = (c: Cell) => c === null || typeof c === "number" || c === "–" || (typeof c === "string" && NUMERIC.test(c));

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

export function CsvButton({ href, label = "Download CSV" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="inline-flex h-11 shrink-0 items-center gap-2 border border-lime-dim px-4 font-sans t-s font-medium text-lime hover:bg-vat-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]"
    >
      <Download aria-hidden="true" />
      {label}
    </a>
  );
}

function csvCell(c: Cell): string {
  if (c === null) return "";
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  let s = c === "–" ? "" : c;
  if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !NUMERIC.test(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function tableCsv(spec: Pick<DataTableSpec, "head" | "rows">): string {
  return [spec.head, ...spec.rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

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
      className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 border border-lime-dim px-4 font-sans t-s font-medium text-lime hover:bg-vat-2 [&_svg]:size-5 [&_svg]:stroke-[1.75]"
    >
      <Download aria-hidden="true" />
      {label}
    </button>
  );
}

export function DataDisclosure({ children, label = "Data table" }: { children: ReactNode; label?: string }) {
  return (
    <Disclosure className="min-w-0" summary={<>{label}</>}>
      <div className="mt-2 min-w-0">{children}</div>
    </Disclosure>
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
  label?: string;
  chartRef: Ref<HTMLDivElement>;
  table: DataTableSpec;
  csvHref?: string;
  csvFile?: string;
  empty?: ReactNode;
  className?: string;
}) {
  const heading = titleCase(title);
  const name = `${number !== undefined ? `Figure ${number}. ` : ""}${label ?? heading}`;
  return (
    <figure data-slot="chart-figure" className={cn("flex min-w-0 flex-col gap-3", className)}>
      <figcaption className="flex flex-col gap-1">
        <span className="font-sans t-s text-lime">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </span>
        <span className="t-s text-lime-dim">{howToRead}</span>
      </figcaption>
      {empty ? (
        <div className="t-b flex min-h-24 items-center bg-vat-2 px-4 text-lime-dim">{empty}</div>
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


export interface IntervalGroup {
  name: string;
  kind: ConditionKind;
  values: number[];
  center: number | null;
  low: number | null;
  high: number | null;
}

export interface IntervalPanel {
  title: string;
  groups: IntervalGroup[];
}

export function intervalScale(panels: IntervalPanel[], zero: boolean): NiceScale | null {
  return niceScale(
    panels.flatMap((p) => p.groups.flatMap((g) => [...g.values, g.low, g.high])),
    zero,
  );
}

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
        axisLabel: {
          color: t.text,
          fontSize: 13,
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
            itemStyle: { color: colour, opacity: 0.6, borderColor: t.page, borderWidth: 1 },
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
            itemStyle: { color: colour, borderColor: t.text, borderWidth: 1.5 },
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
      {panel.title ? <p className="t-label text-lime">{titleCase(panel.title)}</p> : null}
      <div style={{ height }} className="min-w-0 [&_text]:tabular-nums">
        <div ref={ref} role="img" aria-label={`${figure}${panel.title ? `, ${titleCase(panel.title)}` : ""}: ${values}.`} className="h-full w-full" />
      </div>
    </div>
  );
}

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
  zero?: boolean;
  height?: number;
  intervalName?: string;
  centerName?: string;
  csvHref?: string;
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
        <span className="font-sans t-s text-lime">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </span>
        <span className="t-s text-lime-dim">{howToRead}</span>
      </figcaption>
      {!hasData ? (
        <div className="t-b flex min-h-24 items-center bg-vat-2 px-4 text-lime-dim">{empty ?? "No observations yet."}</div>
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


export interface CountSeries {
  name: string;
  kind: ConditionKind;
  values: number[];
  kinds?: ConditionKind[];
}

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
      xAxis: { type: "category", data: categories, ...baseAxis(t), axisLabel: { color: t.text, fontSize: 13, fontWeight: 600, interval: 0, overflow: "break", width: 96 } },
      yAxis: valueAxis(t, unit, { min: 0, minInterval: 1 }),
      series: ordered.map((s) => ({
        type: "bar",
        name: s.name,
        data: s.values.map((v, i) => {
          const kind = s.kinds?.[i] ?? s.kind;
          return { value: v, itemStyle: { color: seriesColour(t, kind), borderColor: t.text, borderWidth: kind === "3d" && v > 0 ? 1.5 : 0, borderType: kind === "3d" ? [4, 2] : "solid" } };
        }),
        barMaxWidth: 32,
        barGap: "12%",
        label: {
          show: true,
          position: "top",
          color: t.text,
          fontSize: 13,
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


export function rampStep(v: number, max: number): number {
  if (v <= 0 || max <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
}

export function TransitionHeatmap({ number, title, howToRead, labels, counts }: { number?: number; title: string; howToRead?: ReactNode; labels: string[]; counts: number[][] }) {
  const keep = labels.map((_, i) => counts[i]!.some((v) => v > 0) || counts.some((r) => (r[i] ?? 0) > 0));
  const idx = labels.map((_, i) => i).filter((i) => keep[i]);
  const shown = idx.map((i) => labels[i]!);
  const data = idx.flatMap((r, y) => idx.map((c, x) => [x, y, counts[r]![c]!] as [number, number, number]));
  const max = Math.max(1, ...data.map((d) => d[2]));
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      tooltip: tooltip(t, { formatter: (p: { value: [number, number, number] }) => miniTable(`${shown[p.value[1]]} to ${shown[p.value[0]]}`, [["Transitions", String(p.value[2])]]) }),
      grid: { left: 8, right: 16, top: 8, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "all", show: false },
      xAxis: { type: "category", data: shown, name: "To", nameLocation: "middle", nameGap: 0, position: "top", ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.textDim, fontSize: 13, rotate: 45, interval: 0 }, nameTextStyle: { color: t.text, fontSize: 15, fontWeight: 600 }, splitArea: { show: false } },
      yAxis: { type: "category", data: shown, name: "From", inverse: true, ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.textDim, fontSize: 13, interval: 0 }, nameTextStyle: { color: t.text, fontSize: 15, fontWeight: 600 } },
      series: [
        {
          type: "heatmap",
          data: data.map(([x, y, v]) => {
            const step = rampStep(v, max);
            return { value: [x, y, v], itemStyle: { color: t.ramp[step], borderColor: t.page, borderWidth: 2 }, label: { show: true, color: t.rampLabel[step], fontSize: 13 } };
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
        <figcaption className="font-sans t-s text-lime">
          {number !== undefined ? <span className="font-semibold tabular-nums">Figure {number}. </span> : null}
          {heading}
        </figcaption>
        <p className="t-b bg-vat-2 px-4 py-3 text-lime-dim">No transitions recorded yet.</p>
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

export interface TimelinePointView {
  seq: number;
  tMs: number;
  lane: string;
  label: string;
}

export function InteractionTimeline({ number, title, points, kind = "other" }: { number?: number; title: string; points: TimelinePointView[]; kind?: ConditionKind }) {
  const lanes = [...new Set(points.map((p) => p.lane))];
  const ref = useEChart(
    (t): EChartsCoreOption => ({
      tooltip: tooltip(t, { formatter: (p: { data: { label: string; value: [number, number] } }) => miniTable(p.data.label, [["Seconds", fixed(p.data.value[0], 1)]]) }),
      grid: grid(t, { bottom: 32 }),
      xAxis: { type: "value", name: "Seconds since the first event", nameLocation: "middle", nameGap: 28, ...baseAxis(t), nameTextStyle: { color: t.text, fontSize: 15, fontWeight: 600 } },
      yAxis: { type: "category", data: lanes, ...baseAxis(t), axisLine: { show: false }, axisLabel: { color: t.textDim, fontSize: 13, interval: 0 }, splitLine: { show: true, lineStyle: { color: t.line } } },
      series: [
        {
          type: "scatter",
          symbol: marker(kind),
          symbolSize: 8,
          itemStyle: { color: seriesColour(t, kind), borderColor: t.page, borderWidth: 1 },
          data: points.map((p) => ({ value: [p.tMs / 1000, lanes.indexOf(p.lane)], label: `#${p.seq} ${p.label}` })),
        },
      ],
    }),
    [JSON.stringify({ points, kind })],
  );
  if (points.length === 0) return <p className="t-b bg-vat-2 px-4 py-3 text-lime-dim">No events recorded for this session.</p>;
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
