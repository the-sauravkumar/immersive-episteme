import type { Metadata } from "next";
import Link from "next/link";

import { CountBars, DotIntervalChart, type IntervalGroup } from "@/components/analytics/charts";
import { conditionKind, orderByCondition } from "@/components/analytics/encoding";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { describe } from "@/features/research/descriptive";
import { METRIC_BY_KEY } from "@/features/research/metric-definitions";
import { can } from "@/lib/permissions/can";
import { plural } from "@/lib/text/plural";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { ANALYSIS_SCOPE_NOTE } from "@/server/research/analysis-scope";
import { behaviourDistributions, outcomeDistributions, studyConditions, studyOverview, type ConditionRef, type MetricDistribution } from "@/server/research/analytics";
import { staleMetricSessions } from "@/server/research/metrics/pipeline";
import { METRIC_DEFINITIONS } from "@/server/research/metrics/session";
import { listStudies } from "@/server/research/studies";

import { ActionForm } from "../_components/action-form";
import { Empty, LINK_44, Notice, ObservationalNotice, pickStudy, Section, StatRow, StudyPicker } from "../_components/common";
import { recomputeMetricsAction } from "../actions";

export const metadata: Metadata = { title: "Analytics" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/analytics">) {
  return (
    <ConsolePage path="/research/analytics" title="Analytics" description="Pseudonymised, descriptive summaries by condition: study overview, outcome distributions and navigation metrics.">
      <Analytics searchParams={searchParams} />
    </ConsolePage>
  );
}

const SESSION_STATUSES = ["scheduled", "in_progress", "completed", "abandoned"];
const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", in_progress: "In progress", completed: "Completed", abandoned: "Abandoned" };

/** Every observation plus the mean and its 95% t interval, per condition, 2D first (DESIGN.md 10). */
function intervalGroups(d: MetricDistribution | undefined, conditions: ConditionRef[], scale = 1): IntervalGroup[] {
  return orderByCondition(
    conditions.map((c) => {
      const values = (d?.byCondition[c.id] ?? []).map((v) => v / scale);
      const s = describe(values);
      return { name: c.label, kind: conditionKind(c.interface), values, center: s.mean, low: s.ciLow, high: s.ciHigh };
    }),
  );
}

/** A readable figure title for a metric key (the key itself is printed in the "How to read" line). */
function metricTitle(key: string): string {
  const known = METRIC_BY_KEY.get(key)?.label;
  if (known) return known;
  const bare = key.replace(/^[a-z]+\./, "").replace(/[._]/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

const nOf = (groups: IntervalGroup[]) => groups.map((g) => `${g.name} n = ${g.values.length}`).join(", ");

async function Analytics({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const [principal, conditions, overview, outcomes, behaviour, stale] = await Promise.all([
    getStaffPrincipal(),
    studyConditions(pool, study.id),
    studyOverview(pool, study.id),
    outcomeDistributions(pool, study.id),
    behaviourDistributions(pool, study.id),
    staleMetricSessions(pool, study.id),
  ]);
  const ordered = orderByCondition(conditions.map((c) => ({ ...c, kind: conditionKind(c.interface) })));
  // Sessions not yet allocated carry no condition id (the read model types it as a string).
  const name = (id: string | null) => (id ? (conditions.find((c) => c.id === id)?.label ?? id) : "Not yet allocated");
  const defs = new Map(METRIC_DEFINITIONS.map((d) => [d.name, d]));
  const nav = behaviour.filter((d) => d.metricName.startsWith("nav."));
  const exposure = behaviour.find((d) => d.metricName === "time.exposure_total_ms");
  const navigation = behaviour.find((d) => d.metricName === "time.navigation_ms");
  const total = overview.enrolment.reduce((n, x) => n + x.n, 0);
  const demo = overview.nonExperimental;
  let figure = 0;
  let table = 0;
  // 2D, then 3D, then the rest (sessions not yet allocated last), as everywhere else (DESIGN.md 10).
  const rankOf = (id: string | null) => {
    const i = ordered.findIndex((c) => c.id === id);
    return i < 0 ? ordered.length : i;
  };
  const telemetryRows = [...overview.telemetry].sort((a, b) => rankOf(a.conditionId) - rankOf(b.conditionId));

  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <ObservationalNotice />
      {demo ? (
        <Notice tone="warn" title="Demo data">
          This is a demo or non-experimental study: its data are never experimental observations.
        </Notice>
      ) : null}

      <Section id="overview" title="Study overview" demo={demo} description={ANALYSIS_SCOPE_NOTE}>
        <StatRow
          number={++table}
          title="Enrolment and Sessions"
          items={[
            { label: "Enrolled", value: total },
            ...overview.enrolment.map((e) => ({ label: `Participants ${e.status.replace(/_/g, " ")}`, value: e.n })),
            { label: "Sessions excluded", value: overview.excluded },
            { label: "Sessions withdrawn", value: overview.withdrawn },
          ]}
        />
        <div className="mb-10 grid min-w-0 gap-10 lg:grid-cols-2 lg:gap-8">
          <CountBars
            number={++figure}
            title="Allocation by condition"
            howToRead={`Bars count allocated participants per condition, from zero (${total} enrolled); 2D solid, 3D dashed outline.`}
            categories={ordered.map((c) => c.label)}
            series={[{ name: "Allocated", kind: "other", kinds: ordered.map((c) => c.kind), values: ordered.map((c) => overview.allocation.find((a) => a.conditionId === c.id)?.n ?? 0) }]}
            unit="participants"
          />
          <CountBars
            number={++figure}
            title="Sessions by status and condition"
            howToRead="Bars count sessions per status, one bar per condition (2D solid, 3D dashed outline), labelled directly, from zero."
            categories={SESSION_STATUSES.map((st) => STATUS_LABEL[st] ?? st)}
            series={ordered.map((c) => ({ name: c.label, kind: c.kind, values: SESSION_STATUSES.map((st) => overview.sessions.find((x) => x.conditionId === c.id && x.status === st)?.n ?? 0) }))}
            unit="sessions"
          />
        </div>
        <Table caption="Telemetry Completeness by Condition" number={++table} hoverRows>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Condition</TableHead>
              <TableHead scope="col" numeric>
                Sessions
              </TableHead>
              <TableHead scope="col" numeric>
                With Events
              </TableHead>
              <TableHead scope="col" numeric>
                Events
              </TableHead>
              <TableHead scope="col" numeric>
                Quarantined
              </TableHead>
              <TableHead scope="col" numeric>
                Open Gaps (Sessions)
              </TableHead>
              <TableHead scope="col" numeric>
                Missing Seq
              </TableHead>
              <TableHead scope="col" numeric>
                Unterminated
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {telemetryRows.map((r) => (
              <TableRow key={r.conditionId}>
                <TableCell>{name(r.conditionId)}</TableCell>
                <TableCell numeric>{r.sessions}</TableCell>
                <TableCell numeric>{r.sessionsWithEvents}</TableCell>
                <TableCell numeric>{r.events}</TableCell>
                <TableCell numeric>{r.quarantined}</TableCell>
                <TableCell numeric>{r.sessionsWithOpenGaps}</TableCell>
                <TableCell numeric>{r.missingSeq}</TableCell>
                <TableCell numeric>{r.unterminatedIntervals}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-body mt-4 text-ink-2">
          {overview.deviations.length
            ? `Protocol deviations: ${overview.deviations.map((d) => `${d.n} ${d.severity} (${d.category})`).join(", ")}.`
            : "No protocol deviations recorded."}
        </p>
      </Section>

      <Section
        id="derived"
        title="Derived metrics"
        description={`Behavioural metrics are recomputed from raw telemetry (pipeline versioned). ${stale.stale} of ${plural(stale.total, "session")} have missing or stale metrics.`}
        actions={can(principal, "study.configure") ? <ActionForm action={recomputeMetricsAction.bind(null, study.id)} submitLabel="Recompute metrics" variant="outline" /> : null}
      >
        <p className="text-body text-ink-2">Navigation pathways, transition matrices and the navigation-to-concept-map comparison have their own page.</p>
        <Link className={LINK_44} href={`/research/pathways?study=${study.id}`}>
          Open pathways
        </Link>
      </Section>

      <Section id="outcomes" title="Outcome distributions" demo={demo} description="Assessment scores from derived_scores (latest computation per session and score). Observational description only.">
        {outcomes.length === 0 ? (
          <Empty>No scores yet.</Empty>
        ) : (
          <div className="grid min-w-0 gap-10 lg:grid-cols-2 lg:gap-8">
            {outcomes.map((d) => {
              const groups = intervalGroups(d, conditions);
              return (
                <DotIntervalChart
                  key={`${d.metricName}@${d.metricVersion}`}
                  number={++figure}
                  title={metricTitle(d.metricName)}
                  howToRead={`${d.metricName} v${d.metricVersion}. Points show sessions; the larger marker is the mean and the line its 95% t interval; ${nOf(groups)}${d.nullCount ? `; ${d.nullCount} undefined` : ""}.`}
                  panels={[{ title: "", groups }]}
                  digits={2}
                />
              );
            })}
          </div>
        )}
      </Section>

      <Section
        id="time"
        title="Content exposure and navigation time"
        demo={demo}
        description="Active minutes per session (pauses excluded), from the shared time accountant. Exposure is held equal by design; these are descriptive covariates, never outcomes."
      >
        {exposure || navigation ? (
          <DotIntervalChart
            number={++figure}
            title="Active minutes per session"
            howToRead={`Small multiples on one minute scale from zero. Points show sessions; the larger marker is the mean and the line its 95% t interval, clipped at zero; ${nOf(intervalGroups(exposure, conditions, 60000))}.`}
            panels={[
              { title: "Content exposure", groups: intervalGroups(exposure, conditions, 60000) },
              { title: "Navigation", groups: intervalGroups(navigation, conditions, 60000) },
            ]}
            unit="Minutes"
            digits={1}
            zero
            height={240}
          />
        ) : (
          <Empty>No timing metrics yet.</Empty>
        )}
      </Section>

      <Section
        id="navigation"
        title="Navigation metrics (CN-20)"
        demo={demo}
        description="Path length, breadth, depth, revisit rate, cross-domain transitions, science-layer engagement, path entropy, sequence patterns, relationships followed and map correspondence. More navigation is not evidence of more learning."
      >
        {nav.length === 0 ? (
          <Empty>No navigation metrics yet.</Empty>
        ) : (
          <div className="grid min-w-0 gap-10 lg:grid-cols-2 lg:gap-8">
            {nav.map((d) => {
              const groups = intervalGroups(d, conditions);
              const def = defs.get(d.metricName);
              return (
                <DotIntervalChart
                  key={d.metricName}
                  number={++figure}
                  title={metricTitle(d.metricName)}
                  howToRead={`${d.metricName} v${d.metricVersion}: ${def?.definition ?? ""} Points show sessions; the larger marker is the mean and the line its 95% t interval; ${nOf(groups)}${d.nullCount ? `; ${d.nullCount} undefined` : ""}.`}
                  panels={[{ title: "", groups }]}
                  unit={def?.unit}
                  digits={2}
                />
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}
