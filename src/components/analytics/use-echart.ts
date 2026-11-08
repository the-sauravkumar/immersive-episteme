"use client";

import { useEffect, useRef } from "react";

import type { EChartsCoreOption } from "echarts/core";

export const VIZ_TOKENS = {
  series2d: "--lime",
  series3d: "--turmeric",
  text: "--lime",
  textDim: "--lime-dim",
  line: "--line",
  page: "--vat",
  onTurmeric: "--vat",
  ramp: ["--vat-2", "--line", "--thread", "--turmeric-lo", "--turmeric", "--turmeric-hi"],
} as const;

export interface VizTheme {
  series2d: string;
  series3d: string;
  text: string;
  textDim: string;
  line: string;
  page: string;
  ramp: string[];
  rampLabel: string[];
  fontFamily: string;
}

export function readVizTheme(get: (name: string) => string, fontFamily = "inherit"): VizTheme {
  const v = (name: string) => get(name).trim();
  const ramp = VIZ_TOKENS.ramp.map(v);
  const text = v(VIZ_TOKENS.text);
  const onTurmeric = v(VIZ_TOKENS.onTurmeric);
  return {
    series2d: v(VIZ_TOKENS.series2d),
    series3d: v(VIZ_TOKENS.series3d),
    text,
    textDim: v(VIZ_TOKENS.textDim),
    line: v(VIZ_TOKENS.line),
    page: v(VIZ_TOKENS.page),
    ramp,
    rampLabel: ramp.map((_, i) => (i < 3 ? text : onTurmeric)),
    fontFamily,
  };
}

export function documentVizTheme(): VizTheme {
  const style = getComputedStyle(document.documentElement);
  const font = getComputedStyle(document.body).fontFamily || "inherit";
  return readVizTheme((name) => style.getPropertyValue(name), font);
}

type ChartInstance = { setOption: (o: EChartsCoreOption, notMerge?: boolean) => void; dispose: () => void; resize: () => void };

export function useEChart(build: (t: VizTheme) => EChartsCoreOption, deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const theme = documentVizTheme();
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
          textStyle: { color: theme.textDim, fontFamily: theme.fontFamily, fontSize: 13 },
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
  }, deps);
  return ref;
}
