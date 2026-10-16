import type { Metadata } from "next";
import Link from "next/link";

import { TransitionHeatmap } from "@/components/analytics/charts";
import { conditionKind } from "@/components/analytics/encoding";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plural } from "@/lib/text/plural";
import { getPool } from "@/server/db/client";
import { analysable, ANALYSIS_SCOPE_NOTE } from "@/server/research/analysis-scope";
import { correspondenceSummary, studyConditions, transitionMatrices } from "@/server/research/analytics";
import { listSessions } from "@/server/research/sessions";
import { listStudies } from "@/server/research/studies";

import { Empty, LINK_44, ObservationalNotice, pickStudy, Section, StudyPicker } from "../_components/common";
import { conditionOrder } from "../dashboard/_components/stats-table";

export const metadata: Metadata = { title: "Pathways" };

const KIND_RANK = { "2d": 0, "3d": 1, other: 2 } as const;

const LABELS: Record<string, string> = {
  conceptsExposed: "Concepts exposed",
  conceptsInspected: "Concepts inspected (sheet open)",
  relationshipsFollowed: "Relationships followed",
  mapEdges: "Concept-map links drawn",
  reconstructedCorrect: "Links matching a snapshot relationship",
  reconstructedIncorrect: "Links matching no snapshot relationship",
  correctAndFollowed: "Matching links that were followed during learning",
  correctWithBothEndpointsInspected: "Matching links with both concepts inspected",
  incorrectWithBothEndpointsInspected: "Non-matching links with both concepts inspected",
};

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/pathways">) {
  return (
    <ConsolePage path="/research/pathways" title="Pathways" description="Navigation structure by condition: transition matrices, interaction timelines and the comparison of navigation with the post-learning concept map.">
      <Pathways searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Pathways({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const [rawConditions, matrices, corr, sessions] = await Promise.all([studyConditions(pool, study.id), transitionMatrices(pool, study.id), correspondenceSummary(pool, study.id), listSessions(pool, study.id)]);
  // DESIGN.md 10: 2D is always first or left.
  const rank = conditionOrder(rawConditions);
  const conditions = [...rawConditions].sort((a, b) => rank(a.id) - rank(b.id));
  // Sessions not yet allocated carry no condition id (the read model types it as a string).
  const name = (id: string | null) => (id ? (conditions.find((c) => c.id === id)?.label ?? id) : "Unallocated");
  const usable = analysable(sessions);
  const orderedMatrices = [...matrices].sort((a, b) => rank(a.conditionId) - rank(b.conditionId));
  let figure = 0;
  let table = 0;
  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <ObservationalNotice />
      <Section
        id="transitions"
        title="Transition matrices"
        demo={study.isDemo}
        description={`Moves between knowledge categories of consecutive concept visits (a visit = a concept's sheet open, DR-050). Rows are where the participant came from. ${ANALYSIS_SCOPE_NOTE}`}
      >
        {orderedMatrices.length === 0 ? (
          <Empty>No telemetry yet.</Empty>
        ) : (
          <div className="grid min-w-0 gap-10 xl:grid-cols-2 xl:gap-8">
            {orderedMatrices.map((m) => (
              <TransitionHeatmap key={m.conditionId ?? "unallocated"} number={++figure} title={`${name(m.conditionId)}: ${plural(m.transitions, "transition")} in ${plural(m.sessions, "session")}`} labels={m.labels} counts={m.counts} />
            ))}
          </div>
        )}
      </Section>

      <Section
        id="correspondence"
        title="Navigation compared with the concept map"
        demo={study.isDemo}
        description="Totals over sessions with a final post-learning concept map. A link 'matches' when the content snapshot has a relationship between the two concepts (direction and type respected when given). Descriptive only; outcome scores against the adjudicated reference map are in Analytics."
      >
        {conditions.length === 0 || Object.keys(corr.byCondition).length === 0 ? (
          <Empty>No correspondence metrics yet (recompute metrics on the Analytics page).</Empty>
        ) : (
          <Table caption="Navigation and Concept-Map Correspondence by Condition" number={++table}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Measure</TableHead>
                {conditions.map((c) => (
                  <TableHead key={c.id} scope="col" numeric>
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="min-w-56 whitespace-normal">Sessions (with a final map)</TableCell>
                {conditions.map((c) => (
                  <TableCell key={c.id} numeric>
                    {corr.byCondition[c.id] ? `${corr.byCondition[c.id]!.sessions} (${corr.byCondition[c.id]!.withMap})` : "0"}
                  </TableCell>
                ))}
              </TableRow>
              {corr.keys.map((k) => (
                <TableRow key={k}>
                  <TableCell className="min-w-56 whitespace-normal">{LABELS[k] ?? k}</TableCell>
                  {conditions.map((c) => (
                    <TableCell key={c.id} numeric>
                      {corr.byCondition[c.id]?.[k] ?? 0}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="timelines" title="Interaction timelines" demo={study.isDemo} description="Analysable sessions; open one for its event timeline.">
        {usable.length === 0 ? (
          <Empty>No analysable sessions.</Empty>
        ) : (
          <Table caption="Analysable Sessions" number={++table} hoverRows density="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Participant</TableHead>
                <TableHead scope="col">Condition</TableHead>
                <TableHead scope="col" numeric>
                  Events
                </TableHead>
                <TableHead scope="col">Timeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...usable]
                .sort((a, b) => KIND_RANK[conditionKind(a.conditionInterface)] - KIND_RANK[conditionKind(b.conditionInterface)] || a.participantCode.localeCompare(b.participantCode))
                .map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-id">{s.participantCode}</TableCell>
                    <TableCell>{s.conditionCode}</TableCell>
                    <TableCell numeric>{s.events}</TableCell>
                    <TableCell>
                      <Link className={LINK_44} href={`/research/sessions/${s.id}`}>
                        Open<span className="sr-only"> the timeline of {s.participantCode}</span>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
