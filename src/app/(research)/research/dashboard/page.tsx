import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CsvButton, DataDisclosure, DotIntervalChart, type IntervalGroup } from "@/components/analytics/charts";
import { conditionKind } from "@/components/analytics/encoding";
import { ContentParity } from "@/components/parity/content-parity";
import { ConsolePage } from "@/components/shell/gates";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardEyebrow, CardFooter, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describe } from "@/features/research/descriptive";
import { METRIC_BY_KEY, METRIC_DEFINITIONS, PRIMARY_OUTCOMES, type MetricGroup } from "@/features/research/metric-definitions";
import { can } from "@/lib/permissions/can";
import { plural } from "@/lib/text/plural";
import { titleCase } from "@/lib/text/title-case";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { ANALYSIS_SCOPE_NOTE } from "@/server/research/analysis-scope";
import type { DashboardData, MeasureRow } from "@/server/research/dashboard";
import { serveDashboard } from "@/server/research/dashboard-service";
import type { DashboardExtraTableName, DashboardTableName } from "@/server/research/exports/dictionary";
import { contentParityRows, type ContentParityRow } from "@/server/research/parity/summary";
import { listStudies } from "@/server/research/studies";

import { DemoBadge, Empty, LINK_44, pickStudy, Section, StatRow, StatusBadge, StudyPicker, SubHeading } from "../_components/common";
import {
  itemStatistics,
  loadItemScoreRows,
  loadTraditionItemRows,
  traditionGains,
  type ItemStat,
  type TraditionGain,
} from "@/server/research/dashboard-extras";
import { LiveSessionsTable } from "./_components/live-sessions";
import { LiveStatus } from "./_components/live-status";
import { breakableKey, conditionOrder, num, StatsTable } from "./_components/stats-table";

export const metadata: Metadata = { title: "Research Dashboard" };

export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/dashboard">) {
  return (
    <ConsolePage
      path="/research/dashboard"
      title="Research Dashboard"
      description="Scores, telemetry and data quality of one study, read live from the database. Descriptive reference for the research team: the inferential analysis runs in analysis/episteme_stats."
    >
      <Dashboard searchParams={searchParams} />
    </ConsolePage>
  );
}

function hasData(rows: MeasureRow[]): boolean {
  return rows.some((r) => r.byCondition.some((c) => c.stats.n + c.stats.missing > 0));
}

function counter() {
  let figure = 0;
  let table = 0;
  return { figure: () => ++figure, table: () => ++table };
}
type Counter = ReturnType<typeof counter>;

function intervalGroups(row: MeasureRow | undefined, data: DashboardData): IntervalGroup[] {
  if (!row) return [];
  const rank = conditionOrder(data.conditions);
  return [...row.byCondition]
    .sort((a, b) => rank(a.conditionId) - rank(b.conditionId))
    .map((c) => {
      const cond = data.conditions.find((x) => x.id === c.conditionId);
      return { name: cond?.label ?? c.conditionId, kind: conditionKind(cond?.interface), values: c.values, center: c.stats.mean, low: c.stats.ciLow, high: c.stats.ciHigh };
    });
}

const nOf = (groups: IntervalGroup[]) => groups.map((g) => `${g.name} n = ${g.values.length}`).join(", ");

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const [principal, { data }, parity, itemRows, traditionRows] = await Promise.all([
    getStaffPrincipal(),
    serveDashboard(study.id),
    contentParityRows(pool, [study]),
    loadItemScoreRows(pool, study.id),
    loadTraditionItemRows(pool, study.id),
  ]);
  if (!data) return <StudyPicker studies={studies} current={null} />;
  const mayDownload = can(principal, "exports.create") || can(principal, "exports.identified");
  const maySessions = can(principal, "sessions.view");
  const csvHref = (table: DashboardTableName) => (mayDownload ? `/research/dashboard/csv?study=${data.study.id}&table=${table}` : undefined);
  const extraCsvHref = (table: DashboardExtraTableName) => (mayDownload ? `/research/dashboard/csv?study=${data.study.id}&table=${table}` : undefined);
  const csv = (table: DashboardTableName) => (mayDownload ? <CsvButton href={`/research/dashboard/csv?study=${data.study.id}&table=${table}`} /> : null);
  const n = counter();
  const demo = data.study.nonExperimental;
  const rank = conditionOrder(data.conditions);
  const conditions = [...data.conditions].sort((a, b) => rank(a.id) - rank(b.id));
  const perCondition = (count: (c: { id: string; code: string }) => number) => conditions.map((c) => `${c.label} ${count(c)}`).join(", ");
  const completed = (c: { id: string }) => data.quality.sessionsByStatus.filter((x) => x.conditionId === c.id && x.status === "completed").reduce((a, x) => a + x.n, 0);
  const inScope = (c: { id: string }) => data.telemetry.sessions.filter((x) => x.conditionId === c.id).length;
  const hasPrimary = (r: DashboardData["primary"]["ancova"][number]) => r.sequence !== null && r.stagePlacement !== null;
  const withPrimary = (c: { code: string }) => data.primary.ancova.filter((r) => r.conditionCode === c.code && hasPrimary(r)).length;
  const totalCompleted = data.quality.sessionsByStatus.filter((x) => x.status === "completed").reduce((a, x) => a + x.n, 0);

  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="t-label text-lime">{data.study.title}</span>
        <span className="t-table font-semibold wrap-anywhere text-lime-dim">{data.study.slug}</span>
        <StatusBadge status={data.study.status} />
        {demo ? <DemoBadge label="Demo / pilot: not experimental data" /> : <Badge variant="neutral">Experimental study</Badge>}
      </div>
      <Alert variant="info" role="note" className="mb-6 max-w-[52rem]">
        <Info aria-hidden="true" />
        <AlertTitle>Note</AlertTitle>
        <AlertDescription>
          Descriptive only. Means, SDs, medians and 95% t intervals describe the recorded data; they test nothing and show no causal effect. The confirmatory analysis
          (ANCOVA of each primary outcome at the immediate test with the pre-test score as covariate, then a mixed model of the immediate and delayed tests, DR-075)
          runs in <code className="t-table font-semibold wrap-anywhere">analysis/episteme_stats</code>. {ANALYSIS_SCOPE_NOTE} Nothing is imputed: undefined values are counted as missing.
        </AlertDescription>
      </Alert>
      {mayDownload ? (
        <div className="mb-10 flex max-w-[52rem] flex-col gap-1">
          <p className="t-b text-lime-dim">
            Every table has a pseudonymised CSV (participant codes only, metric versions in its first line). The complete study data, with checksums and the data
            dictionary, is the full export.
          </p>
          <Link className={LINK_44} href={`/research/exports?study=${data.study.id}`}>
            Open the full export
          </Link>
        </div>
      ) : (
        <p className="t-b mb-10 max-w-[52rem] text-lime-dim">CSV downloads and the full export are for Researchers. Ask a Researcher for the file, or ask an Admin to change your role.</p>
      )}

      <StatRow
        number={n.table()}
        title="Enrolment and Completion"
        aside={<LiveStatus studyId={data.study.id} serverTime={data.generatedAt} fingerprint={data.fingerprint} />}
        items={[
          { label: "Sessions", value: data.sessionsTotal, note: `${data.conditions.length} conditions` },
          { label: "Completed sessions", value: totalCompleted, note: perCondition(completed) },
          { label: "Sessions in scope", value: data.sessionsInScope, note: perCondition(inScope) },
          { label: "Participants with both primary scores", value: data.primary.ancova.filter(hasPrimary).length, note: perCondition(withPrimary) },
        ]}
      />

      <ResultsRow data={data} n={n} demo={demo} csvHref={csvHref} />

      <TraditionRow conditions={conditions} gains={traditionGains(traditionRows, conditions.map((c) => c.id))} n={n} demo={demo} csvHref={extraCsvHref} />

      <ItemsRow
        conditions={conditions}
        items={itemStatistics(itemRows, conditions.map((c) => c.id))}
        n={n}
        demo={demo}
        csvHref={extraCsvHref}
      />

      <ParityCard rows={parity} studyId={data.study.id} mayOpen={can(principal, "parity.run")} />

      <PrimarySection data={data} csv={csv} n={n} demo={demo} />
      <Section id="secondary" title="secondary outcomes" demo={demo} description="Concept-map outcomes in the order of study decision D2, from the post-learning map; secondary measures of relational structure since DR-075." actions={csv("dashboard_secondary")}>
        {hasData(data.secondary) ? (
          <StatsTable rows={data.secondary} conditions={data.conditions} caption="Secondary Outcomes by Condition" number={n.table()} />
        ) : (
          <Empty>No concept-map scores yet for this study.</Empty>
        )}
      </Section>
      <Section
        id="knowledge"
        title="knowledge test and transfer"
        demo={demo}
        description="Keyed items answered correctly per administration (auto-scored), and rubric ratings of open transfer answers (mean across raters)."
        actions={csv("dashboard_knowledge")}
      >
        {hasData(data.knowledge) ? (
          <StatsTable rows={data.knowledge} conditions={data.conditions} digits={2} caption="Knowledge Test and Transfer Scores by Condition" number={n.table()} />
        ) : (
          <Empty>No knowledge-test or transfer scores yet for this study.</Empty>
        )}
      </Section>
      <Section
        id="questionnaires"
        title="questionnaire scale scores"
        demo={demo}
        description="The common questions after learning (mental effort, navigation effort, comfort, engagement); physical presence and SSQ straight after learning, for the 3D condition only; SUS at the end. Other instruments appear when a study's protocol gives them. A scale is scored only when every item was answered."
        actions={csv("dashboard_questionnaires")}
      >
        {hasData(data.questionnaires) ? (
          <StatsTable rows={data.questionnaires} conditions={data.conditions} digits={2} caption="Questionnaire Scale Scores by Condition" number={n.table()} />
        ) : (
          <Empty>No questionnaire answers yet for this study.</Empty>
        )}
      </Section>
      <TelemetrySection data={data} csv={csv} maySessions={maySessions} n={n} demo={demo} />
      <QualitySection data={data} csv={csv} n={n} demo={demo} />
      <Definitions />
    </>
  );
}

const OUTCOME_LABEL = (key: string) => METRIC_BY_KEY.get(key)?.label ?? key;

function outcomePanels(data: DashboardData, phase: "post" | "follow_up") {
  return PRIMARY_OUTCOMES.map((key) => ({ title: OUTCOME_LABEL(key), groups: intervalGroups(data.primary.summary.find((m) => m.key === key && m.phase === phase), data) }));
}

function ResultsRow({ data, n, demo, csvHref }: { data: DashboardData; n: Counter; demo: boolean; csvHref: (t: DashboardTableName) => string | undefined }) {
  const immediate = outcomePanels(data, "post");
  const delayed = outcomePanels(data, "follow_up");
  const counts = (panels: ReturnType<typeof outcomePanels>) => panels.map((p) => `${p.title}: ${p.groups.length ? nOf(p.groups) : "none yet"}`).join("; ");
  const anyValue = (panels: ReturnType<typeof outcomePanels>) => panels.some((p) => p.groups.some((g) => g.values.length > 0));
  return (
    <Section
      id="results"
      title="Score by condition"
      demo={demo}
      description={
        <>
          <code className="t-table font-semibold wrap-anywhere">test.sequence</code> and <code className="t-table font-semibold wrap-anywhere">test.stage_placement</code>, the two primary outcomes of H1 (DR-075): the proportion of
          keyed items answered correctly on the immediate and the delayed test. The pre-test score is the covariate of the analysis and is shown in the table below. Descriptive;
          no causal reading.
        </>
      }
    >
      <div className="grid min-w-0 gap-10 lg:grid-cols-2 lg:gap-8">
        <DotIntervalChart
          number={n.figure()}
          title="Immediate test by condition"
          howToRead={`Points show participants; the larger marker is the mean and the line its 95% t interval; ${counts(immediate)}. Proportion correct, 2 decimals.`}
          panels={immediate}
          unit="Proportion correct"
          digits={2}
          csvHref={csvHref("dashboard_primary")}
          empty={anyValue(immediate) ? undefined : "No immediate test scores yet."}
        />
        <DotIntervalChart
          number={n.figure()}
          title="Delayed test by condition"
          howToRead={`The parallel form taken about 7 days later. Points show participants; the larger marker is the mean and the line its 95% t interval; ${counts(delayed)}. Proportion correct, 2 decimals.`}
          panels={delayed}
          unit="Proportion correct"
          digits={2}
          csvHref={csvHref("dashboard_primary")}
          empty={anyValue(delayed) ? undefined : "No delayed test scores yet."}
        />
      </div>
    </Section>
  );
}

function TraditionRow({
  conditions,
  gains,
  n,
  demo,
  csvHref,
}: {
  conditions: { id: string; label: string; interface: string | null }[];
  gains: TraditionGain[];
  n: Counter;
  demo: boolean;
  csvHref: (table: DashboardExtraTableName) => string | undefined;
}) {
  const panels = gains.map((t) => ({
    title: t.name,
    groups: conditions.map((c, ci) => {
      const values = t.gains[ci] ?? [];
      const s = describe(values);
      return { name: c.label, kind: conditionKind(c.interface), values, center: s.mean, low: s.ciLow, high: s.ciHigh };
    }),
  }));
  const counts = panels.map((p) => `${p.title}: ${nOf(p.groups)}`).join("; ");
  return (
    <Section
      id="traditions"
      title="Gain by tradition"
      demo={demo}
      description={
        <>
          Proportion of keyed knowledge-test items answered correctly on the post-test minus the pre-test, counting only items whose concept belongs to the tradition (
          <code className="t-table font-semibold wrap-anywhere">item.key_match</code>, latest attempt). A descriptive breakdown of the knowledge test, not a registered outcome; no causal reading.
        </>
      }
    >
      <DotIntervalChart
        number={n.figure()}
        title="Gain by tradition"
        howToRead={`Small multiples on one scale, traditions in alphabetical order. Points show sessions (post − pre proportion correct); the larger marker is the mean and the line its 95% t interval; ${counts || "no sessions yet"}. Proportion points, 2 decimals.`}
        panels={panels}
        unit="Change (proportion points)"
        digits={2}
        height={240}
        csvHref={csvHref("dashboard_tradition_gain")}
        empty="No gain by tradition yet: it needs keyed pre-test and post-test items linked to a concept of a tradition, with scored answers in both tests."
      />
    </Section>
  );
}

function ItemsRow({
  conditions,
  items,
  n,
  demo,
  csvHref,
}: {
  conditions: { id: string; label: string }[];
  items: ItemStat[];
  n: Counter;
  demo: boolean;
  csvHref: (table: DashboardExtraTableName) => string | undefined;
}) {
  return (
    <Section
      id="layers-items"
      title="Item statistics"
      demo={demo}
      description="How each keyed test item was answered, by condition. Descriptive; no causal reading."
    >
      <div className="flex flex-col gap-10">
        {items.length ? (
          <div className="flex min-w-0 flex-col gap-3">
            <Table
              caption="Per-Item Statistics"
              number={n.table()}
              hoverRows
              density="compact"
              note="Correct is the proportion of scored answers matching the answer key (item.key_match), 2 decimals; one answer per session and item (latest attempt). Items without an answer key are not listed."
            >
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Assessment</TableHead>
                  <TableHead scope="col">Item</TableHead>
                  {conditions.map((c) => [
                    <TableHead key={`${c.id}-n`} scope="col" numeric>
                      {c.label} n
                    </TableHead>,
                    <TableHead key={`${c.id}-p`} scope="col" numeric>
                      {c.label} correct
                    </TableHead>,
                  ])}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={`${it.assessment}|${it.itemKey}`}>
                    <TableCell className="t-table font-semibold wrap-anywhere">{it.assessment}</TableCell>
                    <TableCell className="t-table font-semibold wrap-anywhere">{it.itemKey}</TableCell>
                    {it.byCondition.map((c, i) => [
                      <TableCell key={`${i}-n`} numeric>
                        {c.n}
                      </TableCell>,
                      <TableCell key={`${i}-p`} numeric>
                        {c.correct === null ? "–" : c.correct.toFixed(2)}
                      </TableCell>,
                    ])}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {csvHref("dashboard_items") ? (
              <div>
                <CsvButton href={csvHref("dashboard_items")!} />
              </div>
            ) : null}
          </div>
        ) : (
          <figure className="flex min-w-0 flex-col gap-2">
            <figcaption className="font-sans t-s text-lime">
              <span className="font-semibold tabular-nums">Table {n.table()}. </span>
              {titleCase("Per-item statistics")}
            </figcaption>
            <Empty className="flex min-h-24 items-center bg-vat-2 px-4">No keyed answers scored yet: keyed items are scored on the Scoring page.</Empty>
          </figure>
        )}
      </div>
    </Section>
  );
}

function ParityCard({ rows, studyId, mayOpen }: { rows: ContentParityRow[]; studyId: string; mayOpen: boolean }) {
  return (
    <Card plate className="mb-12 max-w-[52rem]">
      <CardHeader>
        <CardEyebrow>Equivalence Monitor</CardEyebrow>
        <h2 className="t-label text-lime">{titleCase("content parity")}</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ContentParity rows={rows} />
        <p className="t-s text-lime-dim">
          The latest stored parity report of this study: both doors are checked against one stage template for the same stages, words, sources, model ids and file hashes.
          Interface measures are not compared; nothing measures them now.
        </p>
      </CardContent>
      {mayOpen ? (
        <CardFooter>
          <Link href={`/research/parity?study=${studyId}`} className={LINK_44}>
            Open parity checks
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function PrimarySection({ data, csv, n, demo }: { data: DashboardData; csv: (t: DashboardTableName) => ReactNode; n: Counter; demo: boolean }) {
  return (
    <>
      <Section
        id="primary"
        title="primary outcomes: sequence and stage placement"
        demo={demo}
        description="The pre-test score (the covariate) and test.sequence and test.stage_placement at the immediate and the delayed test, by condition (H1, DR-075)."
        actions={csv("dashboard_primary")}
      >
        {hasData(data.primary.summary) ? (
          <StatsTable rows={data.primary.summary} conditions={data.conditions} caption="Primary Outcomes by Condition" number={n.table()} />
        ) : (
          <Empty>No test scores yet: the pre-test and the tests are scored when the participant submits them.</Empty>
        )}
      </Section>
      <Section
        id="ancova"
        title="ANCOVA-ready table"
        demo={demo}
        description="One row per participant in scope: pseudonym, condition, stratum, pre-test score and both primary outcomes at the immediate and the delayed test. Input for analysis/episteme_stats."
        actions={csv("dashboard_primary_ancova")}
      >
        {data.primary.ancova.length ? (
          <Table caption="ANCOVA-Ready Primary Outcomes" number={n.table()} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Participant</TableHead>
                <TableHead scope="col">Condition</TableHead>
                <TableHead scope="col">Stratum</TableHead>
                <TableHead scope="col" numeric>
                  Pre-Test
                </TableHead>
                <TableHead scope="col" numeric>
                  Sequence
                </TableHead>
                <TableHead scope="col" numeric>
                  Sequence Delayed
                </TableHead>
                <TableHead scope="col" numeric>
                  Stage Placement
                </TableHead>
                <TableHead scope="col" numeric>
                  Stage Placement Delayed
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.primary.ancova.map((r) => (
                <TableRow key={r.participantCode}>
                  <TableCell className="t-table font-semibold wrap-anywhere">{r.participantCode}</TableCell>
                  <TableCell>{r.conditionCode}</TableCell>
                  <TableCell>{r.stratum ?? "–"}</TableCell>
                  <TableCell numeric>{num(r.preTest)}</TableCell>
                  <TableCell numeric>{num(r.sequence)}</TableCell>
                  <TableCell numeric>{num(r.sequenceDelayed)}</TableCell>
                  <TableCell numeric>{num(r.stagePlacement)}</TableCell>
                  <TableCell numeric>{num(r.stagePlacementDelayed)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>No participant has a test score yet.</Empty>
        )}
      </Section>
    </>
  );
}

const TIME_PANELS: [string, string][] = [
  ["stage.total_ms", "Stage time"],
  ["time.pause_ms", "Pause"],
];

function TelemetrySection({
  data,
  csv,
  maySessions,
  n,
  demo,
}: {
  data: DashboardData;
  csv: (t: DashboardTableName) => ReactNode;
  maySessions: boolean;
  n: Counter;
  demo: boolean;
}) {
  const t = data.telemetry;
  const panels = TIME_PANELS.map(([key, title]) => ({ title, groups: intervalGroups(t.summary.find((m) => m.key === key), data) }));
  return (
    <>
      <Section
        id="telemetry"
        title="telemetry and time"
        demo={demo}
        description={
          <>
            From the events both doors send: active minutes at the stages (pauses excluded), paused minutes, stops visited, revisits, back-steps, source panels opened and
            events per session. Computed live from the raw events. Time on the stages is an outcome of self-paced learning (DR-075); the rest describe how the course was
            used.
          </>
        }
        actions={csv("dashboard_telemetry")}
      >
        {t.summary.length ? (
          <div className="flex flex-col gap-10">
            <DotIntervalChart
              number={n.figure()}
              title="Minutes per session by condition"
              howToRead={`Small multiples on one minute scale from zero. Points show sessions in scope; the larger marker is the mean and the line its 95% t interval, clipped at zero; ${nOf(panels[0]!.groups)}.`}
              panels={panels}
              unit="Minutes"
              digits={1}
              zero
              height={240}
            />
            <StatsTable rows={t.summary} conditions={data.conditions} digits={2} caption="Telemetry and Time by Condition" number={n.table()} />
          </div>
        ) : (
          <Empty>No sessions in scope yet.</Empty>
        )}
      </Section>
      <Section id="sessions" title="sessions" demo={demo} description="Per-session telemetry (in scope only). Open a session for its interaction timeline." actions={csv("dashboard_telemetry_sessions")}>
        {t.sessions.length ? (
          <LiveSessionsTable
            studyId={data.study.id}
            generatedAt={data.generatedAt}
            rows={t.sessions}
            conditionNames={Object.fromEntries(data.conditions.map((c) => [c.id, c.label]))}
            maySessions={maySessions}
            number={n.table()}
          />
        ) : (
          <Empty>No sessions in scope yet.</Empty>
        )}
      </Section>
    </>
  );
}

function CountList({ items, empty }: { items: { k: string; n: number }[]; empty: string }) {
  if (!items.length) return <Empty>{empty || "None."}</Empty>;
  return (
    <dl className="border-y border-line">
      {items.map((i) => (
        <div key={i.k} className="flex min-h-11 items-center justify-between gap-4 border-t border-line py-2 first:border-t-0">
          <dt className="font-sans t-s text-lime">{i.k}</dt>
          <dd className="font-sans t-s text-lime tabular-nums">{i.n}</dd>
        </div>
      ))}
    </dl>
  );
}

function QualitySection({ data, csv, n, demo }: { data: DashboardData; csv: (t: DashboardTableName) => ReactNode; n: Counter; demo: boolean }) {
  const q = data.quality;
  const name = (id: string | null) => (id ? (data.conditions.find((c) => c.id === id)?.label ?? id) : "Not yet allocated");
  const quarantined = q.quarantine.reduce((a, x) => a + x.n, 0);
  const openGaps = q.sequence.find((g) => g.kind === "gap")?.open ?? 0;
  const excluded = q.excluded.reduce((a, x) => a + x.n, 0);
  const deviceFailures = q.deviceCheckNotPassed.reduce((a, x) => a + x.n, 0);
  const webglFailures = q.webglFailures.reduce((a, x) => a + x.n, 0);
  return (
    <Section
      id="quality"
      title="data quality"
      demo={demo}
      description="All sessions of the study, including excluded and withdrawn ones. Free-text exclusion details are not shown (pseudonymised view)."
      actions={csv("dashboard_quality")}
    >
      <StatRow
        number={n.table()}
        title="Data Quality Flags"
        items={[
          { label: "Open sequence gaps", value: openGaps },
          { label: "Quarantined events", value: quarantined },
          { label: "Duplicate uploads", value: q.duplicates },
          { label: "Interrupted sessions", value: q.interruptedSessions, note: plural(q.interruptions, "interruption") },
          { label: "Device / WebGL failures", value: deviceFailures + webglFailures, note: plural(q.clientErrors, "client error") },
          { label: "Excluded sessions", value: excluded, note: `${q.withdrawn} withdrawn` },
        ]}
      />
      <div className="grid gap-x-8 gap-y-8 md:grid-cols-2 xl:grid-cols-3">
        <div className="min-w-0">
          <SubHeading>sessions by status</SubHeading>
          <CountList items={q.sessionsByStatus.map((s) => ({ k: `${name(s.conditionId)}: ${s.status.replace(/_/g, " ")}`, n: s.n }))} empty="No sessions yet." />
        </div>
        <div className="min-w-0">
          <SubHeading>sequence anomalies</SubHeading>
          <CountList
            items={q.sequence.flatMap((g) => [
              { k: `${g.kind} (open)`, n: g.open },
              { k: `${g.kind} (resolved)`, n: g.resolved },
              ...(g.kind === "gap" ? [{ k: "missing seq numbers (open gaps)", n: g.missingSeq }] : []),
            ])}
            empty="No sequence anomalies."
          />
        </div>
        <div className="min-w-0">
          <SubHeading>quarantined events by reason</SubHeading>
          <CountList items={q.quarantine.map((x) => ({ k: `${x.reason}${x.unresolved < x.n ? ` (${x.n - x.unresolved} resolved)` : ""}`, n: x.n }))} empty="No quarantined events." />
        </div>
        <div className="min-w-0">
          <SubHeading>device and WebGL</SubHeading>
          <CountList
            items={[
              ...q.deviceCheckNotPassed.map((d) => ({ k: `device check: ${d.verdict}`, n: d.n })),
              ...q.webglFailures.map((w) => ({ k: `3D view failed during ${w.step}`, n: w.n })),
              { k: "client errors (events)", n: q.clientErrors },
            ]}
            empty=""
          />
        </div>
        <div className="min-w-0">
          <SubHeading>exclusions and withdrawals</SubHeading>
          <CountList
            items={[...q.excluded.map((e) => ({ k: `excluded: ${e.category}`, n: e.n })), { k: "withdrawn", n: q.withdrawn }, { k: "completed without telemetry", n: q.completedWithoutTelemetry }]}
            empty=""
          />
        </div>
      </div>
    </Section>
  );
}

const GROUP_TITLES: Record<MetricGroup, string> = {
  primary: "primary outcomes",
  secondary: "secondary outcomes",
  knowledge: "knowledge test and transfer",
  questionnaire: "questionnaires",
  telemetry: "telemetry and time",
  quality: "data quality",
};

function Definitions() {
  const groups = Object.keys(GROUP_TITLES) as MetricGroup[];
  return (
    <Section
      id="definitions"
      title="definitions"
      description="Every metric on this page: version, preregistration role (primary: test.sequence and test.stage_placement, with the pre-test score as covariate, DR-075), what it measures, unit, how and where it is computed, and its citation (quoted verbatim from docs/research/study-decisions.md) or “Project definition”."
    >
      <div className="flex flex-col border-y border-line">
        {groups.map((g) => (
          <div key={g} className="border-t border-line py-1 first:border-t-0">
            <DataDisclosure label={titleCase(GROUP_TITLES[g])}>
              <dl className="flex max-w-[52rem] flex-col gap-5 pb-4">
                {METRIC_DEFINITIONS.filter((d) => d.group === g).map((d) => (
                  <div key={d.key} className="flex min-w-0 flex-col gap-1 font-sans t-s text-lime">
                    <dt className="font-semibold">
                      {d.label} <span className="t-table font-semibold wrap-anywhere font-normal text-lime-dim [overflow-wrap:break-word]">{breakableKey(d.key)} v{d.version}</span>
                    </dt>
                    <dd>
                      <span className="font-medium">Role: {d.role}.</span> {d.measures}
                    </dd>
                    <dd className="text-lime-dim">
                      Unit: {d.unit}. {d.computation} Computed in <code className="t-table font-semibold wrap-anywhere [overflow-wrap:break-word]">{breakableKey(d.computedIn)}</code>.
                    </dd>
                    <dd>
                      {d.citation ? (
                        <>
                          {d.citation.source}, {d.citation.locator}
                          {d.citation.secondary ? " (secondary)" : ""}: <q>{d.citation.quote}</q>
                          {d.note && d.note !== "Project definition." ? <span className="text-lime-dim"> {d.note}</span> : null}
                        </>
                      ) : (
                        <span className="text-lime-dim">{d.note ?? "Project definition."}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </DataDisclosure>
          </div>
        ))}
      </div>
    </Section>
  );
}
