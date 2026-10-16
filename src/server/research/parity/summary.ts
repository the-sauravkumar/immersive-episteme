/**
 * Equivalence Monitor data (DESIGN.md 10, 18 WP0 task 9). Read-only.
 *
 *  - Content parity: the latest STORED report per study from `parity_reports` (the engine in
 *    ./engine.ts, via the existing store); nothing is generated here.
 *  - Interface parity: the report CI commits at `analysis/parity/interface-parity.json`
 *    (`tests/e2e/parity.spec.ts`, WP8), parsed strictly; absent or malformed means null.
 *
 * Neither source ever falls back to sample values: no stored run means "No parity run recorded
 * yet" on every surface that shows the monitor.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { INTERFACE_PARITY_REPORT_PATH, parseInterfaceParityReport, summariseInterfaceParity, type InterfaceParitySummary } from "@/features/research/interface-parity";

import { queryAll, type Q } from "../db";
import { listParityReports } from "./store";

/** The stored interface parity report under `root` (the repository root), summarised, or null. */
export async function readInterfaceParity(root: string = process.cwd()): Promise<InterfaceParitySummary | null> {
  let text: string;
  try {
    // next.config.ts outputFileTracingIncludes ships the report; `root` is chosen at run time.
    text = await readFile(path.join(/*turbopackIgnore: true*/ root, ...INTERFACE_PARITY_REPORT_PATH.split("/")), "utf8");
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const report = parseInterfaceParityReport(raw);
  return report ? summariseInterfaceParity(report) : null;
}

export interface ContentParityRow {
  studyId: string;
  title: string;
  slug: string;
  status: string;
  isDemo: boolean;
  /** Latest stored content parity report, or null when the study has never been checked. */
  latest: {
    id: string;
    createdAt: string;
    passed: boolean;
    criticalFailures: number;
    warnings: number;
    checks: number;
    passedChecks: number;
    snapshotLabel: string | null;
  } | null;
}

/** Latest stored content parity report for each given study, in the order given. */
export async function contentParityRows(q: Q, studies: readonly { id: string; title: string; slug: string; status: string; isDemo: boolean }[]): Promise<ContentParityRow[]> {
  return queryAll(
    q,
    studies.map((s) => async (): Promise<ContentParityRow> => {
      const [r] = await listParityReports(q, s.id, 1);
      return {
        studyId: s.id,
        title: s.title,
        slug: s.slug,
        status: s.status,
        isDemo: s.isDemo,
        latest: r
          ? {
              id: r.id,
              createdAt: r.createdAt,
              passed: r.report.passed,
              criticalFailures: r.report.criticalFailures,
              warnings: r.report.warnings,
              checks: r.report.checks.length,
              passedChecks: r.report.checks.filter((c) => c.passed).length,
              snapshotLabel: r.report.snapshotLabel,
            }
          : null,
      };
    }),
  );
}

export interface EquivalenceSummary {
  content: ContentParityRow[];
  interface: InterfaceParitySummary | null;
}

/** Both halves of the monitor: content parity per study and the latest interface parity run. */
export async function equivalenceSummary(q: Q, studies: Parameters<typeof contentParityRows>[1], root?: string): Promise<EquivalenceSummary> {
  const [content, iface] = await Promise.all([contentParityRows(q, studies), readInterfaceParity(root)]);
  return { content, interface: iface };
}
