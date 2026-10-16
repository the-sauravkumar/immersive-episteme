import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { CsvButton, DataDisclosure, DotIntervalChart, SlopeChart, ValueHeatmap, type IntervalGroup } from "@/components/analytics/charts";
import { conditionKind, orderByCondition } from "@/components/analytics/encoding";
import { interfaceRunLine, NO_PARITY_RUN } from "@/components/parity/equivalence-monitor";
import { ConsolePage } from "@/components/shell/gates";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardEyebrow, CardFooter, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describe } from "@/features/research/descriptive";
import { METRIC_DEFINITIONS, type MetricGroup } from "@/features/research/metric-definitions";
import { can } from "@/lib/permissions/can";
import { plural } from "@/lib/text/plural";
import { titleCase } from "@/lib/text/title-case";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { ANALYSIS_SCOPE_NOTE } from "@/server/research/analysis-scope";
import type { DashboardData, MeasureRow } from "@/server/research/dashboard";
import { serveDashboard } from "@/server/research/dashboard-service";
import type { DashboardExtraTableName, DashboardTableName } from "@/server/research/exports/dictionary";
import { readInterfaceParity } from "@/server/research/parity/summary";
import { listStudies } from "@/server/research/studies";

import { DemoBadge, Empty, LINK_44, pickStudy, Section, StatRow, StatusBadge, StudyPicker, SubHeading } from "../_components/common";
import {
  itemStatistics,
  LAYER_COLUMNS,
  LAYER_METRIC,
  layerDwell,
  loadItemScoreRows,
  loadLayerMetricRows,
  loadTraditionItemRows,
  traditionGains,
  type ItemStat,
  type LayerDwell,
  type TraditionGain,
} from "./_components/dashboard-extras";
import { LiveSessionsTable } from "./_components/live-sessions";
import { LiveStatus } from "./_components/live-status";
import { breakableKey, conditionOrder, num, StatsTable } from "./_components/stats-table";

export const metadata: Metadata = { title: "Research Dashboard" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/*
 * The dashboard reads as the results section of a paper (DESIGN.md 10, 11.9):
 *  1. Table 1, Enrolment and Completion, with the live status at its right;
 *  2. Figure 1 (pre/post slope chart) and Figure 2 (gain, dot plus 95% CI with raw points);
 *  3. Figure 3, gain by tradition: small multiples for the traditions on identical y scales,
 *     canonical order. The primary outcome is one map-level score per participant, so the split
 *     by tradition is drawn from the knowledge test, whose keyed items carry a concept and so a
 *     tradition (./_components/dashboard-extras.ts); a descriptive breakdown, not a registered
 *     outcome, and labelled so;
 *  4. dwell time per layer (heatmap) and Table 2, per-item statistics (./_components/
 *     dashboard-extras.ts, from stored derived values);
 *  5. the Interface Parity card, so the confound control sits next to the results;
 *  then the descriptive tables, telemetry (small multiples on identical scales), data quality
 *  and the metric definitions. Figures and tables are numbered in page order.
 */

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

/** Figure and table numbers in page order (DESIGN.md 7.6). */
function counter() {
  let figure = 0;
  let table = 0;
  return { figure: () => ++figure, table: () => ++table };
}
type Counter = ReturnType<typeof counter>;

/** Dot-and-interval groups (mean and 95% t interval, every value drawn) for one measure row, 2D first. */
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
  const [principal, { data }, iface, layerRows, itemRows, traditionRows] = await Promise.all([
    getStaffPrincipal(),
    serveDashboard(study.id),
    readInterfaceParity(),
    loadLayerMetricRows(pool, study.id),
    loadItemScoreRows(pool, study.id),
    loadTraditionItemRows(pool, study.id),
  ]);
  if (!data) return <StudyPicker studies={studies} current={null} />;
  const mayDownload = can(principal, "exports.create") || can(principal, "exports.identified");
  const maySessions = can(principal, "sessions.view");
  const csvHref = (table: DashboardTableName) => (mayDownload ? `/research/dashboard/csv?study=${data.study.id}&table=${table}` : undefined);
  // Rows 3 and 4: server CSV with the metric-version header (src/server/research/dashboard-extra-tables.ts).
  const extraCsvHref = (table: DashboardExtraTableName) => (mayDownload ? `/research/dashboard/csv?study=${data.study.id}&table=${table}` : undefined);
  const csv = (table: DashboardTableName) => (mayDownload ? <CsvButton href={`/research/dashboard/csv?study=${data.study.id}&table=${table}`} /> : null);
  const n = counter();
  const demo = data.study.nonExperimental;
  const rank = conditionOrder(data.conditions);
  const conditions = [...data.conditions].sort((a, b) => rank(a.id) - rank(b.id));
  const perCondition = (count: (c: { id: string; code: string }) => number) => conditions.map((c) => `${c.label} ${count(c)}`).join(", ");
  const completed = (c: { id: string }) => data.quality.sessionsByStatus.filter((x) => x.conditionId === c.id && x.status === "completed").reduce((a, x) => a + x.n, 0);
  const inScope = (c: { id: string }) => data.telemetry.sessions.filter((x) => x.conditionId === c.id).length;
  const withPrimary = (c: { code: string }) => data.primary.ancova.filter((r) => r.conditionCode === c.code && r.post !== null).length;
  const totalCompleted = data.quality.sessionsByStatus.filter((x) => x.status === "completed").reduce((a, x) => a + x.n, 0);

  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-h3 text-ink">{data.study.title}</span>
        <span className="text-id text-ink-3">{data.study.slug}</span>
        <StatusBadge status={data.study.status} />
        {demo ? <DemoBadge label="Demo / pilot: not experimental data" /> : <Badge variant="neutral">Experimental study</Badge>}
      </div>
      <Alert variant="info" role="note" className="mb-6 max-w-[52rem]">
        <Info aria-hidden="true" />
        <AlertTitle>Note</AlertTitle>
        <AlertDescription>
          Descriptive only. Means, SDs, medians and 95% t intervals describe the recorded data; they test nothing and show no causal effect. The confirmatory analysis
          (ANCOVA of the post score with the pre score as covariate, D2) runs in <code className="text-id">analysis/episteme_stats</code>. {ANALYSIS_SCOPE_NOTE} Nothing
          is imputed: undefined values are counted as missing.
        </AlertDescription>
      </Alert>
      {mayDownload ? (
        <div className="mb-10 flex max-w-[52rem] flex-col gap-1">
          <p className="text-body text-ink-2">
            Every table has a pseudonymised CSV (participant codes only, metric versions in its first line). The complete study data, with checksums and the data
            dictionary, is the full export.
          </p>
          <Link className={LINK_44} href={`/research/exports?study=${data.study.id}`}>
            Open the full export
          </Link>
        </div>
      ) : (
        <p className="text-body mb-10 max-w-[52rem] text-ink-2">CSV downloads and the full export need the exports.create permission, which your roles do not include.</p>
      )}

      <StatRow
        number={n.table()}
        title="Enrolment and Completion"
        aside={<LiveStatus studyId={data.study.id} serverTime={data.generatedAt} fingerprint={data.fingerprint} />}
        items={[
          { label: "Sessions", value: data.sessionsTotal, note: `${data.conditions.length} conditions` },
          { label: "Completed sessions", value: totalCompleted, note: perCondition(completed) },
          { label: "Sessions in scope", value: data.sessionsInScope, note: perCondition(inScope) },
          { label: "Participants with primary score", value: data.primary.ancova.filter((r) => r.post !== null).length, note: perCondition(withPrimary) },
        ]}
      />

      <ResultsRow data={data} n={n} demo={demo} csvHref={csvHref} />

      <TraditionRow conditions={conditions} gains={traditionGains(traditionRows, conditions.map((c) => c.id))} n={n} demo={demo} csvHref={extraCsvHref} />

      <DwellAndItemsRow
        conditions={conditions}
        dwell={layerDwell(layerRows, conditions.map((c) => c.id))}
        items={itemStatistics(itemRows, conditions.map((c) => c.id))}
        n={n}
        demo={demo}
        csvHref={extraCsvHref}
      />

      <InterfaceParityCard summary={iface} />

      <PrimarySection data={data} csv={csv} n={n} demo={demo} />
      <Section id="secondary" title="secondary outcomes" demo={demo} description="Concept-map secondary outcomes in the order of study decision D2, pre-test and post-learning maps." actions={csv("dashboard_secondary")}>
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
        description="Cognitive-load subscales, SUS, physical presence (3D condition only) and SSQ before and after learning. A scale is scored only when every item was answered."
        actions={csv("dashboard_questionnaires")}
      >
        {hasData(data.questionnaires) ? (
          <StatsTable rows={data.questionnaires} conditions={data.conditions} digits={2} caption="Questionnaire Scale Scores by Condition" number={n.table()} />
        ) : (
          <Empty>No questionnaire answers yet for the D7 instruments in this study.</Empty>
        )}
      </Section>
      <TelemetrySection data={data} csv={csv} maySessions={maySessions} n={n} demo={demo} />
      <QualitySection data={data} csv={csv} n={n} demo={demo} />
      <Definitions />
    </>
  );
}

function conditionCounts(lines: { condition: string }[]): string {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.condition, (counts.get(l.condition) ?? 0) + 1);
  return counts.size ? [...counts].map(([c, k]) => `${c} n = ${k}`).join(", ") : "none yet";
}

/** Row 2 of 11.9: Figure 1 (pre to post, slope chart) and Figure 2 (gain, dot plus 95% CI), two equal columns. */
function ResultsRow({ data, n, demo, csvHref }: { data: DashboardData; n: Counter; demo: boolean; csvHref: (t: DashboardTableName) => string | undefined }) {
  const name = (code: string) => data.conditions.find((c) => c.code === code)?.label ?? code;
  const lines = orderByCondition(
    data.primary.ancova.flatMap((r) =>
      r.pre !== null && r.post !== null ? [{ id: r.participantCode, condition: name(r.conditionCode), kind: conditionKind(r.conditionInterface), pre: r.pre, post: r.post }] : [],
    ),
  );
  const gain = intervalGroups(
    data.primary.summary.find((m) => m.phase === "change"),
    data,
  );
  return (
    <Section
      id="results"
      eyebrow="Primary outcome"
      title="Score by condition"
      demo={demo}
      description={
        <>
          <code className="text-id">cmap.recall.dl</code> on the pre-test and post-learning concept maps (study decision D2): the proportion of the adjudicated reference map a participant reproduced. Descriptive; no causal reading.
        </>
      }
    >
      <div className="grid min-w-0 gap-10 lg:grid-cols-2 lg:gap-8">
        <SlopeChart
          number={n.figure()}
          title="Pre/post score by condition"
          howToRead={`Thin lines are participants (${conditionCounts(lines)}); thick lines join each condition's mean pre and post score. Proportion, 2 decimals.`}
          lines={lines}
          unit="cmap.recall.dl (proportion)"
          digits={2}
          preLabel="Pre-test map"
          postLabel="Post-learning map"
          csvHref={csvHref("dashboard_primary_ancova")}
          empty="No participant has both a pre-test and a post-learning score yet."
        />
        <DotIntervalChart
          number={n.figure()}
          title="Learning gain by condition"
          howToRead={`Points show participant gains (post − pre); the larger marker is the mean and the line its 95% t interval; ${gain.length ? nOf(gain) : "no participants yet"}. Proportion points, 2 decimals.`}
          panels={[{ title: "", groups: gain }]}
          unit="Change (proportion points)"
          digits={2}
          csvHref={csvHref("dashboard_primary")}
          empty="No gain scores yet: both maps must be scored against the reference map."
        />
      </div>
    </Section>
  );
}

/**
 * Row 3 of 11.9: Figure 3, gain by tradition, small multiples on one y scale in the canonical
 * tradition order (traditions are never colour-coded; the panels are labelled by name). Every
 * session is drawn; the larger marker is the mean with its 95% t interval.
 */
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
      eyebrow="Knowledge test"
      title="Gain by tradition"
      demo={demo}
      description={
        <>
          Proportion of keyed knowledge-test items answered correctly on the post-test minus the pre-test, counting only items whose concept belongs to the tradition (
          <code className="text-id">item.key_match</code>, latest attempt). A descriptive breakdown of the knowledge test, not a registered outcome; no causal reading.
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

/**
 * Row 4 of 11.9: dwell time per layer (heatmap on the sequential ramp, values in cells) and the
 * per-item statistics (booktabs, right-aligned tabular, Download CSV). Both from stored derived
 * values (./_components/dashboard-extras.ts); with none stored, each says so and draws nothing.
 */
function DwellAndItemsRow({
  conditions,
  dwell,
  items,
  n,
  demo,
  csvHref,
}: {
  conditions: { id: string; label: string }[];
  dwell: LayerDwell;
  items: ItemStat[];
  n: Counter;
  demo: boolean;
  csvHref: (table: DashboardExtraTableName) => string | undefined;
}) {
  const hasDwell = dwell.n.some((k) => k > 0);
  const label = (id: string) => conditions.find((c) => c.id === id)?.label ?? id;
  return (
    <Section
      id="layers-items"
      eyebrow="Process"
      title="Dwell time and item statistics"
      demo={demo}
      description="Where active exposure time went, by knowledge layer, and how each keyed test item was answered, by condition. Descriptive; no causal reading."
    >
      <div className="flex flex-col gap-10">
        <ValueHeatmap
          number={n.figure()}
          title="Dwell time per layer"
          howToRead={
            hasDwell
              ? `Cells print the mean active minutes per session spent with each layer open (pauses excluded), 1 decimal; a darker cell means more time. ${dwell.conditions.map((id, i) => `${label(id)} n = ${dwell.n[i]}`).join(", ")} sessions. From ${LAYER_METRIC} ${dwell.versions.map((v) => `v${v}`).join(", ")}, current as of the last metrics recompute (Analytics).`
              : `Mean active minutes per session per layer, from ${LAYER_METRIC}.`
          }
          rowLabels={dwell.conditions.map(label)}
          colLabels={LAYER_COLUMNS.map((c) => c.label)}
          values={dwell.meanMinutes}
          digits={1}
          valueName="Mean minutes per session"
          rowName="Condition"
          colName="Layer"
          csvHref={csvHref("dashboard_dwell")}
          empty={hasDwell ? undefined : "No per-layer exposure metrics yet: they are computed by “Recompute metrics” on the Analytics page."}
        />
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
                    <TableCell className="text-id">{it.assessment}</TableCell>
                    <TableCell className="text-id">{it.itemKey}</TableCell>
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
            <figcaption className="font-sans text-[0.9375rem] leading-6 text-ink">
              <span className="font-semibold tabular-nums">Table {n.table()}. </span>
              {titleCase("Per-item statistics")}
            </figcaption>
            <Empty className="flex min-h-24 items-center bg-sunk px-4">No keyed answers scored yet: keyed items are scored on the Scoring page.</Empty>
          </figure>
        )}
      </div>
    </Section>
  );
}

/** Row 5 of 11.9: the confound control next to the results (DESIGN.md 3, signature 6). */
function InterfaceParityCard({ summary }: { summary: Awaited<ReturnType<typeof readInterfaceParity>> }) {
  return (
    <Card plate className="mb-12 max-w-[52rem]">
      <CardHeader>
        <CardEyebrow>Equivalence Monitor</CardEyebrow>
        <h2 className="text-h3 text-ink">{titleCase("interface parity")}</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-body text-ink">{summary ? `${interfaceRunLine(summary)}.` : NO_PARITY_RUN}</p>
        <p className="text-credit">The 2D and 3D interfaces are compared check by check (P1-P33), so these results can be read against a measured, not an assumed, equivalence.</p>
      </CardContent>
      <CardFooter>
        <Link href="/research/parity" className={LINK_44}>
          Open parity checks
        </Link>
      </CardFooter>
    </Card>
  );
}

function PrimarySection({ data, csv, n, demo }: { data: DashboardData; csv: (t: DashboardTableName) => ReactNode; n: Counter; demo: boolean }) {
  return (
    <>
      <Section
        id="primary"
        title="primary outcome: expert-map coverage"
        demo={demo}
        description={
          <>
            <code className="text-id">cmap.recall.dl</code> on the pre-test and post-learning maps, and its change, by condition (study decision D2).
            {data.primary.referenceMaps.length > 1 ? ` Scores come from ${data.primary.referenceMaps.length} reference maps; compare only scores of the same reference map.` : ""}
          </>
        }
        actions={csv("dashboard_primary")}
      >
        {hasData(data.primary.summary) ? (
          <StatsTable rows={data.primary.summary} conditions={data.conditions} caption="Primary Outcome by Condition" number={n.table()} />
        ) : (
          <Empty>No primary-outcome scores yet: concept maps are scored on the Scoring page against an adjudicated reference map.</Empty>
        )}
      </Section>
      <Section
        id="ancova"
        title="ANCOVA-ready table"
        demo={demo}
        description="One row per participant in scope: pseudonym, condition, stratum, pre and post cmap.recall.dl. Input for analysis/episteme_stats."
        actions={csv("dashboard_primary_ancova")}
      >
        {data.primary.ancova.length ? (
          <Table caption="ANCOVA-Ready Primary Outcome" number={n.table()} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Participant</TableHead>
                <TableHead scope="col">Condition</TableHead>
                <TableHead scope="col">Stratum</TableHead>
                <TableHead scope="col" numeric>
                  Pre
                </TableHead>
                <TableHead scope="col" numeric>
                  Post
                </TableHead>
                <TableHead scope="col" numeric>
                  Change
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.primary.ancova.map((r) => (
                <TableRow key={r.participantCode}>
                  <TableCell className="text-id">{r.participantCode}</TableCell>
                  <TableCell>{r.conditionCode}</TableCell>
                  <TableCell>{r.stratum ?? "–"}</TableCell>
                  <TableCell numeric>{num(r.pre)}</TableCell>
                  <TableCell numeric>{num(r.post)}</TableCell>
                  <TableCell numeric>{num(r.change)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Empty>No participant has a primary-outcome score yet.</Empty>
        )}
      </Section>
    </>
  );
}

const TIME_PANELS: [string, string][] = [
  ["time.exposure_total_ms", "Content exposure"],
  ["time.navigation_ms", "Navigation"],
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
            Active minutes per session from the shared time accountant (pauses excluded), concepts exposed, coverage of the study snapshot
            {t.scopeConcepts ? ` (${t.scopeConcepts} concepts)` : ""}, relationships followed, citation opens, guidance uses and events. Computed live from the raw events. Descriptive
            covariates kept separate from outcomes (DR-015); exposure time is held equal by design.
          </>
        }
        actions={csv("dashboard_telemetry")}
      >
        {t.summary.length ? (
          <div className="flex flex-col gap-10">
            <DotIntervalChart
              number={n.figure()}
              title="Active minutes per session by condition"
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
          // Updated in place by the live stream (./_components/live-sessions.tsx).
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

/** A labelled list of counts: label left, tabular count right, hairlines between rows. */
function CountList({ items, empty }: { items: { k: string; n: number }[]; empty: string }) {
  if (!items.length) return <Empty>{empty || "None."}</Empty>;
  return (
    <dl className="border-y border-rule">
      {items.map((i) => (
        <div key={i.k} className="flex min-h-11 items-center justify-between gap-4 border-t border-rule py-2 first:border-t-0">
          <dt className="font-sans text-[0.9375rem] leading-5 text-ink">{i.k}</dt>
          <dd className="font-sans text-[0.9375rem] leading-5 text-ink tabular-nums">{i.n}</dd>
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
          { label: "Device / WebGL failures", value: deviceFailures + q.webglContextLost, note: plural(q.clientErrors, "client error") },
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
              { k: "WebGL context lost (events)", n: q.webglContextLost },
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
  primary: "primary outcome",
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
      description="Every metric on this page: version, preregistration role (primary: cmap.recall.dl post with pre as covariate, D2), what it measures, unit, how and where it is computed, and its citation (quoted verbatim from docs/research/study-decisions.md) or “Project definition”."
    >
      <div className="flex flex-col border-y border-rule">
        {groups.map((g) => (
          <div key={g} className="border-t border-rule py-1 first:border-t-0">
            <DataDisclosure label={titleCase(GROUP_TITLES[g])}>
              <dl className="flex max-w-[52rem] flex-col gap-5 pb-4">
                {METRIC_DEFINITIONS.filter((d) => d.group === g).map((d) => (
                  <div key={d.key} className="flex min-w-0 flex-col gap-1 font-sans text-[0.9375rem] leading-6 text-ink">
                    <dt className="font-semibold">
                      {d.label} <span className="text-id font-normal text-ink-3 [overflow-wrap:break-word]">{breakableKey(d.key)} v{d.version}</span>
                    </dt>
                    <dd>
                      <span className="font-medium">Role: {d.role}.</span> {d.measures}
                    </dd>
                    <dd className="text-ink-2">
                      Unit: {d.unit}. {d.computation} Computed in <code className="text-id [overflow-wrap:break-word]">{breakableKey(d.computedIn)}</code>.
                    </dd>
                    <dd>
                      {d.citation ? (
                        <>
                          {d.citation.source}, {d.citation.locator}
                          {d.citation.secondary ? " (secondary)" : ""}: <q>{d.citation.quote}</q>
                          {d.note && d.note !== "Project definition." ? <span className="text-ink-2"> {d.note}</span> : null}
                        </>
                      ) : (
                        <span className="text-ink-2">{d.note ?? "Project definition."}</span>
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
