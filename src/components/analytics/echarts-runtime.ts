import { BarChart, CustomChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { DatasetComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { init, use as registerEcharts } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

registerEcharts([BarChart, LineChart, ScatterChart, HeatmapChart, CustomChart, GridComponent, TooltipComponent, DatasetComponent, MarkLineComponent, SVGRenderer]);

export { init };
