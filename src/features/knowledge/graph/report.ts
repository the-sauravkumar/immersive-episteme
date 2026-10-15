/**
 * Graph integrity report: machine-readable JSON plus a human-readable markdown rendering.
 * The JSON is deterministic for a given input (no timestamps unless the caller adds one).
 */
import { VERIFICATION_STATES, type VerificationState } from "@/lib/validation/enums";

import { loadContentFiles, type ContentFileInput } from "./loader";
import { ALL_RULES, type RuleDefinition } from "./rules";
import type { IntegrityIssue, KnowledgeGraphModel, Severity } from "./types";
import { sortIssues, validateGraph, type ValidationOptions } from "./validate";

export const INTEGRITY_REPORT_VERSION = 1 as const;

export type StateCounts = Record<VerificationState, number>;

export interface IntegrityReport {
  reportVersion: typeof INTEGRITY_REPORT_VERSION;
  files: { path: string; slug: string; kind: string; sha256: string | null }[];
  counts: { packages: number; concepts: number; claims: number; relationships: number; sources: number };
  verificationStates: { concepts: StateCounts; relationships: StateCounts; sources: StateCounts };
  issueCounts: Record<Severity, number>;
  byCode: Record<string, number>;
  ok: boolean;
  rules: readonly RuleDefinition[];
  issues: IntegrityIssue[];
}

export function countStates(items: readonly { verificationState: VerificationState }[]): StateCounts {
  const counts = Object.fromEntries(VERIFICATION_STATES.map((s) => [s, 0])) as StateCounts;
  for (const i of items) counts[i.verificationState]++;
  return counts;
}

export function buildIntegrityReport(model: KnowledgeGraphModel, issues: readonly IntegrityIssue[]): IntegrityReport {
  const sorted = sortIssues(issues);
  const issueCounts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  const byCode: Record<string, number> = {};
  for (const i of sorted) {
    issueCounts[i.severity]++;
    byCode[i.code] = (byCode[i.code] ?? 0) + 1;
  }
  return {
    reportVersion: INTEGRITY_REPORT_VERSION,
    files: [...model.packages]
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map((p) => ({ path: p.path, slug: p.slug, kind: p.kind, sha256: p.fileSha256 })),
    counts: {
      packages: model.packages.length,
      concepts: model.concepts.length,
      claims: model.concepts.reduce((n, c) => n + c.claims.length, 0),
      relationships: model.relationships.length,
      sources: model.sources.length,
    },
    verificationStates: {
      concepts: countStates(model.concepts),
      relationships: countStates(model.relationships),
      sources: countStates(model.sources),
    },
    issueCounts,
    byCode: Object.fromEntries(Object.entries(byCode).sort(([a], [b]) => (a < b ? -1 : 1))),
    ok: issueCounts.error === 0,
    rules: ALL_RULES,
    issues: sorted,
  };
}

/** Load + validate + report in one call (what the CLI and the real-content test use). */
export function validateContentFiles(
  files: readonly ContentFileInput[],
  options: ValidationOptions = {},
): { model: KnowledgeGraphModel; report: IntegrityReport } {
  const { model, issues: loadIssues } = loadContentFiles(files);
  const issues = [...loadIssues, ...validateGraph(model, options)];
  return { model, report: buildIntegrityReport(model, issues) };
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function renderIntegrityMarkdown(report: IntegrityReport, opts: { title?: string; maxPerCode?: number } = {}): string {
  const max = opts.maxPerCode ?? 40;
  const lines: string[] = [];
  lines.push(`# ${opts.title ?? "Knowledge graph integrity report"}`, "");
  lines.push(
    `**Result:** ${report.ok ? "no error-level issues" : `${report.issueCounts.error} error-level issue(s)`}; ` +
      `${report.issueCounts.warning} warning(s); ${report.issueCounts.info} info`,
    "",
  );
  const c = report.counts;
  lines.push(`${c.packages} files, ${c.concepts} concepts, ${c.claims} claims, ${c.relationships} relationships, ${c.sources} sources.`, "");

  lines.push("## Verification states", "", "| State | Concepts | Relationships | Sources |", "|---|---:|---:|---:|");
  for (const s of VERIFICATION_STATES) {
    const v = report.verificationStates;
    if (v.concepts[s] + v.relationships[s] + v.sources[s] === 0) continue;
    lines.push(`| ${s} | ${v.concepts[s]} | ${v.relationships[s]} | ${v.sources[s]} |`);
  }
  lines.push("");

  lines.push("## Files", "", "| File | Slug | Kind | sha256 |", "|---|---|---|---|");
  for (const f of report.files) lines.push(`| ${f.path} | ${f.slug} | ${f.kind} | ${f.sha256 ? `\`${f.sha256.slice(0, 16)}…\`` : "—"} |`);
  lines.push("");

  const ruleByCode = new Map(report.rules.map((r) => [r.code, r]));
  lines.push("## Issues by rule", "", "| Code | Severity | Rule | Count |", "|---|---|---|---:|");
  for (const [code, n] of Object.entries(report.byCode)) {
    const r = ruleByCode.get(code);
    lines.push(`| ${code} | ${r?.severity ?? "?"} | ${escapeCell(r?.title ?? "")} | ${n} |`);
  }
  if (Object.keys(report.byCode).length === 0) lines.push("| — | — | no issues | 0 |");
  lines.push("");

  for (const severity of ["error", "warning", "info"] as const) {
    const items = report.issues.filter((i) => i.severity === severity);
    if (items.length === 0) continue;
    lines.push(`## ${severity === "error" ? "Errors" : severity === "warning" ? "Warnings" : "Information"} (${items.length})`, "");
    const codes = [...new Set(items.map((i) => i.code))];
    for (const code of codes) {
      const group = items.filter((i) => i.code === code);
      lines.push(`### ${code} — ${ruleByCode.get(code)?.title ?? ""} (${group.length})`, "");
      for (const i of group.slice(0, max)) lines.push(`- ${escapeCell(i.message)}`);
      if (group.length > max) lines.push(`- … ${group.length - max} more in the JSON report`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
