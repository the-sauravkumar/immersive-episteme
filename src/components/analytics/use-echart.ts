"use client";

/**
 * Mounts an ECharts instance (SVG renderer, tree-shaken modules, loaded on demand so echarts
 * ships only with research pages) and keeps it in sync with the option and the display theme.
 *
 * Single palette source (DESIGN.md 10): the chart colours are the CSS custom properties of
 * src/app/globals.css, read through getComputedStyle(document.documentElement) at mount and
 * again whenever the classes on <html> change (light, dark, high contrast and their dark
 * variant), so charts follow every theme with no palette of their own. `animation: false`.
 *
 * No ECharts `aria` option: its aria component overwrites the container's aria-label with a
 * generated English description (category indexes mixed with values, no figure number). The
 * accessible name is the authored label on the role="img" container (charts.tsx), and the
 * values are in each figure's Data table disclosure.
 */
import { useEffect, useRef, useState } from "react";

import type { EChartsCoreOption } from "echarts/core";

/** The tokens a chart reads, by role (DESIGN.md 4.2, 10). */
export const VIZ_TOKENS = {
  series2d: "--series-2d",
  series3d: "--series-3d",
  ink: "--ink",
  ink2: "--ink-2",
  ink3: "--ink-3",
  grid: "--grid",
  rule: "--rule",
  surface: "--ground",
  sunk: "--sunk",
  onIndigo: "--on-indigo",
  ramp: ["--viz-seq-1", "--viz-seq-2", "--viz-seq-3", "--viz-seq-4", "--viz-seq-5", "--viz-seq-6"],
} as const;

export interface VizTheme {
  series2d: string;
  series3d: string;
  ink: string;
  ink2: string;
  ink3: string;
  grid: string;
  rule: string;
  surface: string;
  sunk: string;
  onIndigo: string;
  /** Sequential single-hue ramp, light to dark (heatmaps). */
  ramp: string[];
  /** Cell label colour per ramp step: --ink on steps 1-3, --on-indigo on steps 4-6 (DESIGN.md 4.3). */
  rampLabel: string[];
  fontFamily: string;
}

/** Builds the chart theme from a custom-property reader; pure, so tests can feed it parsed CSS. */
export function readVizTheme(get: (name: string) => string, fontFamily = "inherit"): VizTheme {
  const v = (name: string) => get(name).trim();
  const ramp = VIZ_TOKENS.ramp.map(v);
  const ink = v(VIZ_TOKENS.ink);
  const onIndigo = v(VIZ_TOKENS.onIndigo);
  return {
    series2d: v(VIZ_TOKENS.series2d),
    series3d: v(VIZ_TOKENS.series3d),
    ink,
    ink2: v(VIZ_TOKENS.ink2),
    ink3: v(VIZ_TOKENS.ink3),
    grid: v(VIZ_TOKENS.grid),
    rule: v(VIZ_TOKENS.rule),
    surface: v(VIZ_TOKENS.surface),
    sunk: v(VIZ_TOKENS.sunk),
    onIndigo,
    ramp,
    rampLabel: ramp.map((_, i) => (i < 3 ? ink : onIndigo)),
    fontFamily,
  };
}

/** The theme as the document currently computes it. */
export function documentVizTheme(): VizTheme {
  const style = getComputedStyle(document.documentElement);
  const font = getComputedStyle(document.body).fontFamily || "inherit";
  return readVizTheme((name) => style.getPropertyValue(name), font);
}

/** Re-reads the tokens whenever <html> changes class (theme, high contrast) or style. */
function useVizTheme(): VizTheme | null {
  const [theme, setTheme] = useState<VizTheme | null>(null);
  useEffect(() => {
    let last = "";
    const update = () => {
      const next = documentVizTheme();
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setTheme(next);
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

type ChartInstance = { setOption: (o: EChartsCoreOption, notMerge?: boolean) => void; dispose: () => void; resize: () => void };

export function useEChart(build: (t: VizTheme) => EChartsCoreOption, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useVizTheme();
  useEffect(() => {
    if (!theme) return;
    let disposed = false;
    let chart: ChartInstance | null = null;
    let observer: ResizeObserver | null = null;
    void (async () => {
      const [core, charts, components, renderers] = await Promise.all([
        import("echarts/core"),
        import("echarts/charts"),
        import("echarts/components"),
        import("echarts/renderers"),
      ]);
      core.use([
        charts.BarChart,
        charts.LineChart,
        charts.ScatterChart,
        charts.HeatmapChart,
        charts.CustomChart,
        components.GridComponent,
        components.TooltipComponent,
        components.DatasetComponent,
        components.MarkLineComponent,
        renderers.SVGRenderer,
      ]);
      if (disposed || !ref.current) return;
      chart = core.init(ref.current, undefined, { renderer: "svg" });
      chart.setOption(
        {
          textStyle: { color: theme.ink3, fontFamily: theme.fontFamily, fontSize: 13 },
          animation: false,
          ...build(theme),
        },
        true,
      );
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(ref.current);
    })();
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ...deps]);
  return ref;
}
