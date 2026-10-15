/**
 * Questionnaire scale scores for the research dashboard (pure, client-safe), computed from the
 * raw answers of the D7 instruments (src/server/study/instruments.ts; item keys as seeded there).
 *
 * Rules:
 *  - A scale is scored only when EVERY item of the scale has a numeric answer. A skipped or
 *    unreadable item leaves the scale undefined (null): nothing is imputed or prorated.
 *  - These are descriptive project definitions, versioned below. They are not validated scale
 *    scores: the D7 rewording breaks the original validation (study-decisions.md, D7 risks).
 *  - The SSQ Total Score follows Kennedy, Lane, Berbaum & Lilienthal (1993), Table 4, p. 212
 *    (PDF p. 11): unit weights on the Nausea, Oculomotor and Disorientation columns, each column
 *    summed, and TS = ([1] + [2] + [3]) × 3.74. The weight matrix was read from the rendered page
 *    (its OCR text is scrambled); see study-decisions.md D7.
 */
export const SCALE_SCORE_VERSION = "1.1.0";

/**
 * Kennedy et al. (1993) Table 4 unit weights, by symptom position in the seeded order
 * (src/server/study/instruments.ts SSQ_SYMPTOMS, which follows the table): N, O, D columns.
 */
export const SSQ_COLUMNS = {
  nausea: [1, 6, 7, 8, 9, 15, 16],
  oculomotor: [1, 2, 3, 4, 5, 9, 11],
  disorientation: [5, 8, 10, 11, 12, 13, 14],
} as const;
export const SSQ_TOTAL_FACTOR = 3.74;

export interface ScaleSpec {
  /** Score name (metric-name style). */
  name: string;
  instrument: "cognitive-load" | "sus" | "mps-physical-presence" | "ssq";
  label: string;
  items: readonly string[];
  rule: "mean" | "sum" | "sus" | "ssq-total";
  /** Possible range of the score. */
  range: readonly [number, number];
  /** Shown for these interfaces only (null = both). */
  interfaces: readonly ("conventional_2d" | "immersive_3d")[] | null;
}

const keys = (prefix: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}.${from + i}`);

export const SCALES: readonly ScaleSpec[] = [
  { name: "cl.intrinsic", instrument: "cognitive-load", label: "Intrinsic load", items: keys("il", 1, 3), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_instructions", instrument: "cognitive-load", label: "Extraneous load: instructions", items: keys("el-instr", 4, 6), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_interaction", instrument: "cognitive-load", label: "Extraneous load: interaction", items: keys("el-int", 1, 4), rule: "mean", range: [0, 10], interfaces: null },
  { name: "cl.extraneous_environment", instrument: "cognitive-load", label: "Extraneous load: environment", items: keys("el-env", 1, 4), rule: "mean", range: [0, 10], interfaces: null },
  { name: "sus.score", instrument: "sus", label: "SUS score", items: keys("sus", 1, 10), rule: "sus", range: [0, 100], interfaces: null },
  { name: "presence.physical", instrument: "mps-physical-presence", label: "Physical presence", items: keys("p", 1, 5), rule: "mean", range: [1, 5], interfaces: ["immersive_3d"] },
  // Maximum: each column holds 7 symptoms rated 0–3, so (21 + 21 + 21) × 3.74 = 235.62.
  { name: "ssq.total", instrument: "ssq", label: "SSQ total score", items: keys("ssq", 1, 16), rule: "ssq-total", range: [0, 235.62], interfaces: null },
];

/** Score of one scale from one administration's answers (item key → numeric answer); null when incomplete. */
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
      // Items 1, 3, 5, 7, 9: response − 1; items 2, 4, 6, 8, 10: 5 − response; total × 2.5.
      return values.reduce((a, v, i) => a + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
    case "ssq-total": {
      const column = (positions: readonly number[]) => positions.reduce((a, p) => a + values[p - 1]!, 0);
      return (column(SSQ_COLUMNS.nausea) + column(SSQ_COLUMNS.oculomotor) + column(SSQ_COLUMNS.disorientation)) * SSQ_TOTAL_FACTOR;
    }
  }
}

/** Numeric answer of a stored `responses.raw` ({ value } shape or a bare number); null otherwise. */
export function numericAnswer(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === "object" && typeof (raw as { value?: unknown }).value === "number") {
    const v = (raw as { value: number }).value;
    return Number.isFinite(v) ? v : null;
  }
  return null;
}
