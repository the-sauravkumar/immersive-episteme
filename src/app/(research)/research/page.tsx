import type { Metadata } from "next";
import Link from "next/link";

import { ContentParity } from "@/components/parity/content-parity";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPool } from "@/server/db/client";
import { listParityReports } from "@/server/research/parity/store";
import { contentParityRows } from "@/server/research/parity/summary";
import { listSessions, integrityFlags } from "@/server/research/sessions";
import { listStudies } from "@/server/research/studies";

import { DemoBadge, Empty, LINK_44, Section, StatusBadge } from "./_components/common";

export const metadata: Metadata = { title: "Research overview" };

export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/research" title="Research overview" description="Studies, recruitment progress and data-quality alerts, led by the content parity of the two conditions.">
      <Overview />
    </ConsolePage>
  );
}

async function Overview() {
  const pool = getPool();
  const studies = await listStudies(pool);
  const active = studies.filter((s) => s.status === "active");
  const [rows, content] = await Promise.all([
    Promise.all(
      studies.map(async (s) => {
        const [parity, sessions] = await Promise.all([listParityReports(pool, s.id, 1), listSessions(pool, s.id)]);
        const alerts = sessions.reduce((n, x) => n + integrityFlags(x).filter((f) => f.level !== "info").length, 0);
        return { s, parity: parity[0] ?? null, alerts, completed: sessions.filter((x) => x.status === "completed").length };
      }),
    ),
    contentParityRows(pool, active),
  ]);
  const anyDemo = studies.some((s) => s.isDemo);

  return (
    <>
      <Section
        id="equivalence"
        eyebrow="Confound control"
        title="Equivalence Monitor"
        demo={active.some((s) => s.isDemo)}
        description="The latest stored content parity report of each active study: both doors checked against one stage template for the same stages, words, sources, model ids and file hashes. Nothing here is estimated or sampled."
        actions={
          <Link href="/research/parity" className={LINK_44}>
            Open parity checks
          </Link>
        }
      >
        {active.length ? (
          <ContentParity rows={content} number={1} studyHref={(id) => `/research/parity?study=${id}`} />
        ) : (
          <Empty>No study is active, so no content parity is shown here. Each study&apos;s content parity is on its page and on Parity checks.</Empty>
        )}
      </Section>

      <Section
        id="studies"
        title="Studies"
        demo={anyDemo}
        description="Latest parity verdict and data-quality alerts (interruptions, gaps, quarantined events, deviations, exclusions) per study."
      >
        {rows.length === 0 ? (
          <Empty>
            No studies yet.{" "}
            <Link className={LINK_44} href="/research/studies">
              Create a study
            </Link>
            .
          </Empty>
        ) : (
          <Table caption="Studies, Recruitment and Alerts" number={active.length ? 2 : 1}>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Study</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" numeric>
                  Participants
                </TableHead>
                <TableHead scope="col" numeric>
                  Sessions (Completed)
                </TableHead>
                <TableHead scope="col">Parity</TableHead>
                <TableHead scope="col" numeric>
                  Alerts
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, parity, alerts, completed }) => (
                <TableRow key={s.id}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link className={LINK_44} href={`/research/studies/${s.id}`}>
                      {s.title}
                    </Link>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-lime-dim">
                      <span className="t-table font-semibold wrap-anywhere">{s.slug}</span>
                      <span className="t-s text-lime-dim">protocol {s.protocolVersion}</span>
                      {s.isDemo ? <DemoBadge label="Demo" /> : null}
                    </span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell numeric>{s.participants}</TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {s.sessions} ({completed})
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {parity ? (
                      <Link className={LINK_44} href={`/research/parity?study=${s.id}`}>
                        {parity.report.passed ? "Passed" : `Failed (${parity.report.criticalFailures} critical)`}
                      </Link>
                    ) : (
                      <span className="text-lime-dim">Not run</span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    {alerts > 0 ? (
                      <Link className={`${LINK_44} justify-end`} href={`/research/sessions?study=${s.id}`} aria-label={`${alerts} alerts in ${s.title}`}>
                        {alerts}
                      </Link>
                    ) : (
                      0
                    )}
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
