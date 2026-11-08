export const SCALE_SCORE_VERSION = "1.2.0";

const SSQ_COLUMNS = {
  nausea: [1, 6, 7, 8, 9, 15, 16],
  oculomotor: [1, 2, 3, 4, 5, 9, 11],
  disorientation: [5, 8, 10, 11, 12, 13, 14],
} as const;
const SSQ_TOTAL_FACTOR = 3.74;

export interface ScaleSpec {
  name: string;
  instrument: "cognitive-load" | "sus" | "umux-lite" | "mps-physical-presence" | "ssq" | "common-questions";
  label: string;
  items: readonly string[];
  rule: "mean" | "sum" | "sus" | "umux-lite" | "ssq-total";
  range: readonly [number, number];
  interfaces: readonly ("conventional_2d" | "immersive_3d")[] | null;
}

const keys = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}.${from + i}`);

export const SCALES: readonly ScaleSpec[] = [
  { name: "cl.intrinsic", instrument: "cognitive-load", label: "Intrinsic load", items: keys("il", 1, 3), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_instructions", instrument: "cognitive-load", label: "Extraneous load: instructions", items: keys("el-instr", 4, 6), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_interaction", instrument: "cognitive-load", label: "Extraneous load: interaction", items: keys("el-int", 1, 4), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_environment", instrument: "cognitive-load", label: "Extraneous load: environment", items: keys("el-env", 1, 4), rule: "mean", range: [0, 10], interfaces: null },
  { name: "common.mental_effort", instrument: "common-questions", label: "Mental effort", items: ["common.mental_effort"], rule: "mean", range: [1, 7], interfaces: null },
  { name: "common.navigation_effort", instrument: "common-questions", label: "Navigation effort", items: ["common.navigation_effort"], rule: "mean", range: [1, 7], interfaces: null },
  { name: "common.comfort", instrument: "common-questions", label: "Comfort", items: ["common.comfort"], rule: "mean", range: [1, 7], interfaces: null },
  { name: "common.engagement", instrument: "common-questions", label: "Engagement", items: ["common.engagement"], rule: "mean", range: [1, 7], interfaces: null },
  { name: "sus.score", instrument: "sus", label: "SUS score", items: keys("sus", 1, 10), rule: "sus", range: [0, 100], interfaces: null },
  { name: "umux_lite.score", instrument: "umux-lite", label: "UMUX-LITE score", items: keys("umux-lite", 1, 2), rule: "umux-lite", range: [0, 100], interfaces: null },
  { name: "presence.physical", instrument: "mps-physical-presence", label: "Physical presence", items: keys("p", 1, 5), rule: "mean", range: [1, 5], interfaces: ["immersive_3d"] },
  { name: "ssq.total", instrument: "ssq", label: "SSQ total score", items: keys("ssq", 1, 16), rule: "ssq-total", range: [0, 235.62], interfaces: null },
];

export function scoreScale(spec: ScaleSpec, answers: ReadonlyMap<string, number | null>): number | null {
  const values: number[] = [];
  for (const key of spec.items) {
    const v = answers.get(key);
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    values.push(v);
  }
  const sum = values.reduce((a, b) => a + b, 0);
  switch (spec.rule) {
    case "mean":
      return sum / values.length;
    case "sum":
      return sum;
    case "sus":
      return values.reduce((a, v, i) => a + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
    case "umux-lite":
      return values.reduce((a, v) => a + v - 1, 0) * (100 / 12);
    case "ssq-total": {
      const column = (positions: readonly number[]) => positions.reduce((a, p) => a + values[p - 1]!, 0);
      return (column(SSQ_COLUMNS.nausea) + column(SSQ_COLUMNS.oculomotor) + column(SSQ_COLUMNS.disorientation)) * SSQ_TOTAL_FACTOR;
    }
  }
}

export function numericAnswer(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { value?: unknown }).value === "number") {
    const v = (raw as { value: number }).value;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}
