/**
 * Interface parity report (DESIGN.md 12.4, 18 WP0 task 9).
 *
 * `tests/e2e/parity.spec.ts` (WP8) measures checks P1-P27 on the 2D concept page and the 3D panel
 * for one concept per study tradition, at four viewports and four themes, and writes one report
 * to `analysis/parity/interface-parity.json`; CI commits it. The Equivalence Monitor reads ONLY
 * that stored file: when it is absent or malformed the monitor says "No parity run recorded yet"
 * and shows nothing else. There is no sample or placeholder path.
 *
 * Schema: { runId, commit, runs: [{ viewport, theme, traditionKey, checks: [{ id, label, value2d,
 * value3d, delta, tolerance, passed, notMeasured? }] }] }. Optional extras (`generatedAt`) are allowed.
 *
 * `notMeasured` lists the parts of a check's pass condition (DESIGN.md 12.4) that the run could not
 * measure, each with its reason. A check whose measured parts pass but which carries any
 * `notMeasured` part is "partial", never "pass": an unmeasured part is not evidence of equivalence.
 */
import { z } from "zod";

/** Where CI writes the report, relative to the repository root. */
export const INTERFACE_PARITY_REPORT_PATH = "analysis/parity/interface-parity.json";

/** The 27 checks of DESIGN.md 12.4, in order, with the short wording used on every surface. */
export const PARITY_CHECKS: readonly { id: string; label: string }[] = [
  { id: "P1", label: "Computed style of claim, title, caption, credit, quote, source line and citation button" },
  { id: "P2", label: "Content width of the claim paragraph" },
  { id: "P3", label: "Number of rendered lines per claim" },
  { id: "P4", label: "Knowledge container background and backdrop filter" },
  { id: "P5", label: "Text of claims, citation records, captions, credits and alt text" },
  { id: "P6", label: "Offset of the first heading below the chrome" },
  { id: "P7", label: "Top bar and access notice heights" },
  { id: "P8", label: "Claim lines visible in the first screen" },
  { id: "P9", label: "Every interactive element at least 44 by 44 px" },
  { id: "P10", label: "Text contrast in the knowledge container" },
  { id: "P11", label: "Interactions to the first claim, a citation record, a figure and a layer" },
  { id: "P12", label: "No transitions or animations on study routes" },
  { id: "P13", label: "Tab stops to the first source note" },
  { id: "P14", label: "Figure slots: count, order, source, alt, caption, credit, size" },
  { id: "P15", label: "Layout shift on load and on panel open" },
  { id: "P16", label: "Figure decode latency" },
  { id: "P17", label: "Neutral tradition marker identical for every tradition" },
  { id: "P18", label: "Position of the related concepts block" },
  { id: "P19", label: "Both conditions import the same knowledge components" },
  { id: "P20", label: "Shared interface strings" },
  { id: "P21", label: "Figure counts per section across the study traditions" },
  { id: "P22", label: "Shared top bar controls and skip link" },
  { id: "P23", label: "Shared component markup: hint, timer, onboarding, messages, settings" },
  { id: "P24", label: "Interaction counts for the shared controls" },
  { id: "P25", label: "Reading-progress bar" },
  { id: "P26", label: "Equal salience of the study traditions" },
  { id: "P27", label: "Focus on the concept title when a concept opens" },
];

const value = z.union([z.number(), z.string(), z.boolean(), z.null()]);

const viewport = z.union([
  z.object({ width: z.number().int().positive(), height: z.number().int().positive() }),
  z.string().regex(/^\d+\s*[x×]\s*\d+$/),
]);

export const interfaceParityCheckSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  value2d: value,
  value3d: value,
  delta: value,
  tolerance: value,
  passed: z.boolean(),
  /** Parts of the pass condition that this run did not measure, each with its reason. */
  notMeasured: z.array(z.string().min(1)).optional(),
});

export const interfaceParityRunSchema = z.object({
  viewport,
  theme: z.string().min(1),
  traditionKey: z.string().min(1),
  checks: z.array(interfaceParityCheckSchema),
});

export const interfaceParityReportSchema = z.object({
  runId: z.string().min(1),
  commit: z.string().min(1),
  generatedAt: z.string().optional(),
  runs: z.array(interfaceParityRunSchema).min(1),
});

export type InterfaceParityCheck = z.infer<typeof interfaceParityCheckSchema>;
export type InterfaceParityRun = z.infer<typeof interfaceParityRunSchema>;
export type InterfaceParityReport = z.infer<typeof interfaceParityReportSchema>;
export type ParityValue = z.infer<typeof value>;

/** A parsed report, or null when the input is not a valid report (never a partial one). */
export function parseInterfaceParityReport(raw: unknown): InterfaceParityReport | null {
  const parsed = interfaceParityReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** "1280 x 800" whatever form the report used. */
export function viewportLabel(v: InterfaceParityRun["viewport"]): string {
  if (typeof v === "string") return v.replace(/\s*[x×]\s*/, " x ");
  return `${v.width} x ${v.height}`;
}

/** The run a reader sees first: 1280 x 800 light when present (DESIGN.md 10), else the first run. */
export function headlineRun(report: InterfaceParityReport): InterfaceParityRun {
  return report.runs.find((r) => viewportLabel(r.viewport) === "1280 x 800" && r.theme === "light") ?? report.runs[0]!;
}

/**
 * pass: passed in every run that measured it, with nothing left unmeasured; fail: failed in at
 * least one run; partial: the measured parts passed everywhere, but some part was not measured;
 * not-measured: no run measured it.
 */
export type ParityCheckStatus = "pass" | "fail" | "partial" | "not-measured";

export interface ParityCheckSummary {
  id: string;
  label: string;
  /** Runs (viewport x theme x tradition) that measured this check, and how many passed. */
  runs: number;
  passedRuns: number;
  /** A check passes only if it passed in every run that measured it and nothing was left unmeasured. */
  passed: boolean;
  status: ParityCheckStatus;
  /** The distinct parts not measured in any run (empty when everything was measured). */
  notMeasured: string[];
  /** The values shown: the first failing run, else the headline run, else the first run measuring it. */
  shown: { run: InterfaceParityRun; check: InterfaceParityCheck } | null;
}

export interface InterfaceParitySummary {
  runId: string;
  commit: string;
  generatedAt: string | null;
  runs: number;
  headline: { viewport: string; theme: string };
  /** Every check of PARITY_CHECKS, in order, then any extra id the report carries. */
  checks: ParityCheckSummary[];
  /** Checks measured in at least one run; how many pass, are partial (some part not measured) or fail. */
  measured: number;
  passing: number;
  partial: number;
  failing: number;
}

export function summariseInterfaceParity(report: InterfaceParityReport): InterfaceParitySummary {
  const headline = headlineRun(report);
  const known = new Map(PARITY_CHECKS.map((c) => [c.id, c.label]));
  const ids = [...PARITY_CHECKS.map((c) => c.id)];
  for (const run of report.runs) for (const c of run.checks) if (!ids.includes(c.id)) ids.push(c.id);

  const checks = ids.map((id): ParityCheckSummary => {
    const hits = report.runs.flatMap((run) => run.checks.filter((c) => c.id === id).map((check) => ({ run, check })));
    const passedRuns = hits.filter((h) => h.check.passed).length;
    const notMeasured = [...new Set(hits.flatMap((h) => h.check.notMeasured ?? []))];
    const status: ParityCheckStatus = hits.length === 0 ? "not-measured" : passedRuns < hits.length ? "fail" : notMeasured.length > 0 ? "partial" : "pass";
    const shown = hits.find((h) => !h.check.passed) ?? hits.find((h) => h.run === headline) ?? hits[0] ?? null;
    return {
      id,
      label: known.get(id) ?? hits[0]?.check.label ?? id,
      runs: hits.length,
      passedRuns,
      passed: status === "pass",
      status,
      notMeasured,
      shown,
    };
  });
  const measured = checks.filter((c) => c.runs > 0);
  return {
    runId: report.runId,
    commit: report.commit,
    generatedAt: report.generatedAt ?? null,
    runs: report.runs.length,
    headline: { viewport: viewportLabel(headline.viewport), theme: headline.theme },
    checks,
    measured: measured.length,
    passing: measured.filter((c) => c.status === "pass").length,
    partial: measured.filter((c) => c.status === "partial").length,
    failing: measured.filter((c) => c.status === "fail").length,
  };
}

/** A measured value as printed in the monitor: numbers keep their stored precision, null is "–". */
export function formatParityValue(v: ParityValue): string {
  if (v === null) return "–";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(3)));
  return v;
}
