import type { Metadata } from "next";
import Link from "next/link";

import { ConsolePage } from "@/components/shell/gates";
import { InviteParticipantsGuide, StudySetupGuide, type GuideStudy } from "@/components/shell/staff-guides";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions/can";
import { requireStaff } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { latestParityReports } from "@/server/research/parity/store";
import { listSessions, integrityFlags } from "@/server/research/sessions";
import { getStudy, listStudies, type StudySummary } from "@/server/research/studies";

import { DemoBadge, Empty, LINK_44, Section, StatusBadge } from "./_components/common";

export const metadata: Metadata = { title: "Research Home" };

export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/research" title="Research home" description="Your team's studies and what needs you now, with the steps for setting up a study and inviting participants.">
      <Home />
    </ConsolePage>
  );
}

function followed(studies: readonly StudySummary[], status: string): StudySummary | null {
  return studies.find((s) => !s.isDemo && s.status === status) ?? null;
}

async function Home() {
  const pool = getPool();
  const principal = await requireStaff();
  const mayOpenParity = can(principal, "parity.run");
  const studies = await listStudies(pool);
  const ids = studies.map((s) => s.id);
  const [sessions, parity] = await Promise.all([listSessions(pool, ids), latestParityReports(pool, ids)]);
  const rows = studies
    .filter((s) => s.status !== "closed")
    .map((s) => {
      const own = sessions.filter((x) => x.studyId === s.id);
      const attention = own.filter((x) => integrityFlags(x).some((f) => f.level !== "info")).length;
      return { s, parity: parity.get(s.id) ?? null, attention, completed: own.filter((x) => x.status === "completed").length };
    })
    .sort((a, b) => b.attention - a.attention);
  const draft = followed(studies, "draft");
  const detail = draft ? await getStudy(pool, draft.id) : null;
  const setup: GuideStudy | null = detail
    ? {
        id: detail.id,
        title: detail.title,
        status: detail.status,
        hasRelease: detail.snapshotId !== null,
        hasAssessments: detail.battery.length > 0,
        parityPassed: parity.get(detail.id)?.report.passed ?? false,
      }
    : null;
  const running = followed(studies, "active");
  const needing = rows.reduce((n, r) => n + r.attention, 0);

  return (
    <>
      <Section
        id="studies"
        title="Your studies"
        demo={rows.some((r) => r.s.isDemo)}
        description={
          needing === 0
            ? "No session needs attention."
            : `${needing} session${needing === 1 ? " needs" : "s need"} attention: a participant withdrew, a session broke off, activity records went missing or the protocol was not followed. Open the number to see them.`
        }
      >
        {rows.length === 0 ? (
          <Empty>
            No open studies.{" "}
            <Link className={LINK_44} href="/research/studies#new">
              Create a study
            </Link>
            .
          </Empty>
        ) : (
          <Table caption="Open Studies and Sessions Needing Attention" number={1}>
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
                <TableHead scope="col">Doors Match</TableHead>
                <TableHead scope="col" numeric>
                  Need Attention
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ s, parity, attention, completed }) => {
                const verdict = parity ? (parity.report.passed ? "Yes" : "No") : "Not checked";
                return (
                  <TableRow key={s.id}>
                    <TableCell className="min-w-56 whitespace-normal">
                      <Link className={LINK_44} href={`/research/studies/${s.id}`}>
                        {s.title}
                      </Link>
                      {s.isDemo ? (
                        <span className="mt-1 flex">
                          <DemoBadge label="Demo" />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell numeric>{s.participants}</TableCell>
                    <TableCell numeric className="whitespace-nowrap">
                      {s.sessions} ({completed})
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {parity && mayOpenParity ? (
                        <Link className={LINK_44} href={`/research/parity?study=${s.id}`}>
                          {verdict}
                        </Link>
                      ) : (
                        <span className={parity ? undefined : "text-lime-dim"}>{verdict}</span>
                      )}
                    </TableCell>
                    <TableCell numeric>
                      {attention > 0 ? (
                        <Link className={`${LINK_44} justify-end`} href={`/research/sessions?study=${s.id}`} aria-label={`${attention} sessions need attention in ${s.title}`}>
                          {attention}
                        </Link>
                      ) : (
                        0
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <StudySetupGuide study={setup} />
        <InviteParticipantsGuide study={running} mayMakeCodes={can(principal, "admin.users")} mayWatch={can(principal, "participants.manage")} />
      </div>
    </>
  );
}
