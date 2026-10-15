/**
 * Equivalence Monitor (DESIGN.md 3 signature 6, 10, 11.8). Presentational and server-safe: the
 * caller passes what `src/server/research/parity/summary.ts` read from the stored reports.
 *
 *  - Interface parity: a run line ("Interface parity run: commit abc123, 1280 x 800 light; 27 of
 *    27 checks pass") and, in the full variant, a booktabs table: Check, What Is Compared, 2D, 3D,
 *    Delta, Tolerance, Runs, Status (icon plus "Pass", "Partial" or "Fail"). "Partial" means the
 *    measured parts passed but a part of the check was not measured; the parts are listed under the
 *    check's description, so an unmeasured part never reads as a pass. With no stored run it renders
 *    the sentence "No parity run recorded yet." and nothing else: never sample values.
 *  - Content parity (optional): the latest stored engine report per study.
 *
 * `tone="console"` colours the status words with --ok/--danger (console only, DESIGN.md 4.2);
 * `tone="neutral"` keeps them ink, for public pages. The word and icon are always present (R-A4).
 */
import { CircleCheck, CircleDashed, CircleX, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatParityValue, type InterfaceParitySummary, type ParityCheckStatus } from "@/features/research/interface-parity";
import type { ContentParityRow } from "@/server/research/parity/summary";
import { cn } from "@/lib/utils";

export const NO_PARITY_RUN = "No parity run recorded yet.";

type Tone = "console" | "neutral";

export function ParityStatus({ passed, status, tone = "console", children }: { passed: boolean | null; status?: ParityCheckStatus; tone?: Tone; children?: ReactNode }) {
  const partial = status === "partial";
  const Icon = passed === null ? Minus : partial ? CircleDashed : passed ? CircleCheck : CircleX;
  const colour = tone === "neutral" || passed === null ? "text-ink" : partial ? "text-warn" : passed ? "text-ok" : "text-danger";
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium whitespace-nowrap", colour)}>
      <Icon aria-hidden="true" className="size-4 shrink-0 stroke-[1.75]" />
      {children ?? (passed === null ? "Not run" : partial ? "Partial" : passed ? "Pass" : "Fail")}
    </span>
  );
}

/**
 * "Interface parity run: commit abc123, 1280 x 800 light; 25 of 27 checks pass; 1 partly
 * measured, 1 fails". Partial and failing checks are always named as such, never folded into a pass.
 */
export function interfaceRunLine(s: InterfaceParitySummary): string {
  const rest = [s.partial ? `${s.partial} partly measured` : null, s.failing ? `${s.failing} ${s.failing === 1 ? "fails" : "fail"}` : null].filter(Boolean);
  return `Interface parity run: commit ${s.commit.slice(0, 7)}, ${s.headline.viewport} ${s.headline.theme}; ${s.passing} of ${s.measured} checks pass${rest.length ? `; ${rest.join(", ")}` : ""}`;
}

function RunLine({ summary }: { summary: InterfaceParitySummary }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body text-ink">
        {interfaceRunLine(summary)}
        {"."}
      </p>
      <p className="text-credit">
        Run <span className="text-mono">{summary.runId}</span>
        {summary.generatedAt ? (
          <>
            {" "}
            recorded <time dateTime={summary.generatedAt}>{summary.generatedAt.replace("T", " ").slice(0, 16)}</time> UTC
          </>
        ) : null}
        , {summary.runs} {summary.runs === 1 ? "run" : "runs"} (viewport, theme and tradition). A check passes only if it passes in every run.
      </p>
    </div>
  );
}

/** The interface half: the run line, then (full) the per-check table. */
export function InterfaceParity({ summary, full = false, tone = "console", number }: { summary: InterfaceParitySummary | null; full?: boolean; tone?: Tone; number?: number }) {
  if (!summary) return <p className="text-body text-ink">{NO_PARITY_RUN}</p>;
  return (
    <div data-slot="interface-parity" className="flex min-w-0 flex-col gap-4">
      <RunLine summary={summary} />
      {full ? (
        <Table caption="Interface Parity by Check" number={number} label={number === undefined ? "Interface parity by check" : undefined} density="compact">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Check</TableHead>
              <TableHead scope="col">What Is Compared</TableHead>
              <TableHead scope="col" numeric>
                2D
              </TableHead>
              <TableHead scope="col" numeric>
                3D
              </TableHead>
              <TableHead scope="col" numeric>
                Delta
              </TableHead>
              <TableHead scope="col" numeric>
                Tolerance
              </TableHead>
              <TableHead scope="col" numeric>
                Runs Passed
              </TableHead>
              <TableHead scope="col">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {summary.checks.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="tabular-nums">{c.id}</TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  {c.label}
                  {c.notMeasured.length > 0 ? <span className="text-credit mt-1 block">Not measured: {c.notMeasured.join("; ")}</span> : null}
                </TableCell>
                <TableCell numeric>{c.shown ? formatParityValue(c.shown.check.value2d) : "–"}</TableCell>
                <TableCell numeric>{c.shown ? formatParityValue(c.shown.check.value3d) : "–"}</TableCell>
                <TableCell numeric>{c.shown ? formatParityValue(c.shown.check.delta) : "–"}</TableCell>
                <TableCell numeric>{c.shown ? formatParityValue(c.shown.check.tolerance) : "–"}</TableCell>
                <TableCell numeric className="whitespace-nowrap">
                  {c.runs ? `${c.passedRuns} of ${c.runs}` : "–"}
                </TableCell>
                <TableCell>
                  <ParityStatus passed={c.runs ? c.passed : null} status={c.status} tone={tone}>
                    {c.runs ? undefined : "Not measured"}
                  </ParityStatus>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

/** The content half: the latest stored engine report per study. */
export function ContentParity({ rows, number, tone = "console", studyHref }: { rows: ContentParityRow[]; number?: number; tone?: Tone; studyHref?: (studyId: string) => string }) {
  if (rows.length === 0) return <p className="text-body text-ink-2">No studies yet, so no content parity report exists.</p>;
  return (
    <Table caption="Content Parity by Study" number={number} label={number === undefined ? "Content parity by study" : undefined}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Study</TableHead>
          <TableHead scope="col">Snapshot</TableHead>
          <TableHead scope="col" numeric>
            Checks Passed
          </TableHead>
          <TableHead scope="col" numeric>
            Critical
          </TableHead>
          <TableHead scope="col">Recorded (UTC)</TableHead>
          <TableHead scope="col">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.studyId}>
            <TableCell className="min-w-48 whitespace-normal">
              {studyHref ? (
                <Link className="inline-flex min-h-11 items-center text-indigo underline underline-offset-[3px] hover:text-indigo-hover hover:decoration-2" href={studyHref(r.studyId)}>
                  {r.title}
                </Link>
              ) : (
                r.title
              )}
              <span className="text-mono block text-ink-3">{r.slug}</span>
            </TableCell>
            <TableCell>{r.latest?.snapshotLabel ?? "–"}</TableCell>
            <TableCell numeric className="whitespace-nowrap">
              {r.latest ? `${r.latest.passedChecks} of ${r.latest.checks}` : "–"}
            </TableCell>
            <TableCell numeric>{r.latest ? r.latest.criticalFailures : "–"}</TableCell>
            <TableCell className="text-mono whitespace-nowrap">{r.latest ? r.latest.createdAt.replace("T", " ").slice(0, 16) : "–"}</TableCell>
            <TableCell>
              <ParityStatus passed={r.latest ? r.latest.passed : null} tone={tone} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * The monitor: interface parity (run line, plus the per-check table when `full`) and, when
 * `content` is given, the content parity table.
 */
export function EquivalenceMonitor({
  interfaceParity,
  content,
  full = false,
  tone = "console",
  numbers,
  studyHref,
}: {
  interfaceParity: InterfaceParitySummary | null;
  content?: ContentParityRow[];
  full?: boolean;
  tone?: Tone;
  /** Table numbers on the page, e.g. { interface: 1, content: 2 }. */
  numbers?: { interface?: number; content?: number };
  studyHref?: (studyId: string) => string;
}) {
  return (
    <div data-slot="equivalence-monitor" className="flex min-w-0 flex-col gap-8">
      <InterfaceParity summary={interfaceParity} full={full} tone={tone} number={numbers?.interface} />
      {content ? <ContentParity rows={content} number={numbers?.content} tone={tone} studyHref={studyHref} /> : null}
    </div>
  );
}
