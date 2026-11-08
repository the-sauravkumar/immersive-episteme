import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DataDisclosure } from "@/components/analytics/charts";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPool } from "@/server/db/client";
import type { ParityCheck, ParityGroup, ParityReport } from "@/server/research/parity/engine";
import { getParityReport, listParityReports } from "@/server/research/parity/store";
import { listStudies } from "@/server/research/studies";

import { ActionForm } from "../_components/action-form";
import { Empty, LINK_44, pickStudy, Section, StudyPicker, SummaryList, Timestamp } from "../_components/common";
import { runParityAction } from "../actions";

export const metadata: Metadata = { title: "Parity checks" };

const GROUPS: Record<ParityGroup, string> = {
  base: "Pinned inputs",
  t: "One template: same stages, words, sources, models and files in both doors",
  d: "Prompts, assessments and guidance policy",
  e: "Self-paced learning with one cap",
};

export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/parity">) {
  return (
    <ConsolePage
      path="/research/parity"
      title="Parity checks"
      description="The Equivalence Monitor: the machine-readable content parity report of a study configuration. Critical content failures block activation."
    >
      <Parity searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Parity({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const reports = await listParityReports(pool, study.id, 20);
  const base = 1;
  const wanted = typeof sp.report === "string" ? await getParityReport(pool, sp.report) : null;
  const shown = wanted && wanted.report.studyId === study.id ? wanted : (reports[0] ?? null);
  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <Section
        id="run"
        title="Run"
        demo={study.isDemo}
        description="Generates a report from the study's current configuration, stage templates and door views, and stores it (append-only) once the study has a pinned snapshot; without one the failed checks are shown in the result instead."
      >
        <ActionForm action={runParityAction.bind(null, study.id)} submitLabel="Run parity check" />
      </Section>
      {shown ? (
        <ReportView base={base} id={shown.id} createdAt={shown.createdAt} sha={shown.reportSha256} report={shown.report} demo={study.isDemo} />
      ) : (
        <Empty className="mb-12">No content parity report for this study yet.</Empty>
      )}
      {reports.length > 1 ? (
        <Section id="earlier" title="Earlier reports" demo={study.isDemo}>
          <Table caption="Stored Content Parity Reports" number={base + (shown ? groupCount(shown.report) : 0)} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Recorded (UTC)</TableHead>
                <TableHead scope="col">Result</TableHead>
                <TableHead scope="col" numeric>
                  Critical
                </TableHead>
                <TableHead scope="col">Inputs (SHA-256)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} data-state={r.id === shown?.id ? "selected" : undefined}>
                  <TableCell>
                    <Link className={LINK_44} href={`/research/parity?study=${study.id}&report=${r.id}`} aria-current={r.id === shown?.id ? "true" : undefined}>
                      <Timestamp iso={r.createdAt} />
                    </Link>
                    {r.id === shown?.id ? <span className="ml-2 t-s text-lime-dim">Selected</span> : null}
                  </TableCell>
                  <TableCell>
                    <Verdict passed={r.report.passed} />
                  </TableCell>
                  <TableCell numeric>{r.report.criticalFailures}</TableCell>
                  <TableCell className="t-table font-semibold wrap-anywhere">{r.report.inputSha256.slice(0, 12)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}
    </>
  );
}

function Verdict({ passed }: { passed: boolean }) {
  const Icon = passed ? CircleCheck : CircleX;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap ${passed ? "text-ok" : "text-madder-text"}`}>
      <Icon aria-hidden="true" className="size-4 stroke-[1.75]" />
      {passed ? "Passed" : "Failed"}
    </span>
  );
}

function CheckStatus({ c }: { c: ParityCheck }) {
  if (c.passed) return <Verdict passed />;
  const critical = c.severity === "critical";
  const Icon = critical ? CircleX : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap ${critical ? "text-madder-text" : "text-turmeric"}`}>
      <Icon aria-hidden="true" className="size-4 stroke-[1.75]" />
      {critical ? "Critical" : "Warning"}
    </span>
  );
}

const groupsOf = (report: ParityReport) =>
  (Object.keys(GROUPS) as ParityGroup[]).map((g) => ({ g, checks: report.checks.filter((c) => c.group === g) })).filter((x) => x.checks.length);
const groupCount = (report: ParityReport) => groupsOf(report).length;

function ReportView({ base, id, createdAt, sha, report, demo }: { base: number; id: string; createdAt: string; sha: string; report: ParityReport; demo: boolean }) {
  const groups = groupsOf(report);
  return (
    <Section
      id="report"
      title={report.passed ? "Report: passed" : `Report: failed (${report.criticalFailures} critical)`}
      demo={demo}
      actions={
        <a className={LINK_44} href={`/research/parity/report?id=${id}`} download>
          Download JSON
        </a>
      }
    >
      <SummaryList
        className="mb-8"
        items={[
          { label: "Recorded (UTC)", value: <Timestamp iso={createdAt} /> },
          { label: "Result", value: <Verdict passed={report.passed} /> },
          { label: "Generator", value: <span className="t-table font-semibold wrap-anywhere">{report.generatorVersion}</span> },
          { label: "Snapshot", value: report.snapshotLabel ?? "None" },
          { label: "Manifest", value: <span className="t-table font-semibold wrap-anywhere">{report.manifestId?.slice(0, 12) ?? "None"}</span> },
          { label: "Report SHA-256", value: <span className="t-table font-semibold wrap-anywhere break-all">{sha}</span> },
          {
            label: "Content set",
            value: report.schemaVersion === 2 ? `${report.contentSet.stages} stages, ${report.contentSet.items} tools and materials, ${report.contentSet.products} product images, citing ${report.contentSet.sources} sources` : "A report from the earlier design",
          },
        ]}
      />
      <div className="flex flex-col gap-8">
        {groups.map(({ g, checks }, i) => (
          <Table key={g} caption={GROUPS[g]} number={base + i} hoverRows className="min-w-[40rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-[52%]">
                  Check
                </TableHead>
                <TableHead scope="col" className="w-28">
                  Status
                </TableHead>
                <TableHead scope="col">Measures</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="align-top whitespace-normal">
                    {c.label}
                    <span className="t-table font-semibold wrap-anywhere mt-0.5 block text-lime-dim">{c.id}</span>
                    {c.issues.length ? (
                      <div className="mt-1">
                        <DataDisclosure label={c.issues.length === 1 ? "1 issue" : `${c.metrics.issueCount ?? c.issues.length} issues`}>
                          <ul className="list-disc pl-5 font-sans text-[0.875rem] leading-5 text-lime-dim">
                            {c.issues.slice(0, 50).map((iss, k) => (
                              <li key={k}>{iss.message}</li>
                            ))}
                          </ul>
                        </DataDisclosure>
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <CheckStatus c={c} />
                  </TableCell>
                  <TableCell className="align-top whitespace-normal tabular-nums text-lime-dim">
                    {Object.entries(c.metrics)
                      .filter(([k]) => k !== "issueCount")
                      .map(([k, v]) => `${k} ${v}`)
                      .join(", ") || "–"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
      </div>
      <p className="t-s text-lime-dim mt-4">
        Issue lists show at most 50 entries per check;{" "}
        <a className={LINK_44} href={`/research/parity/report?id=${id}`} download>
          the JSON report
        </a>{" "}
        holds every issue.
      </p>
    </Section>
  );
}
