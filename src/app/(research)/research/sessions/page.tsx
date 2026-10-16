import type { Metadata } from "next";
import Link from "next/link";

import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { participantDataScope } from "@/lib/permissions/can";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { integrityFlags, listSessions } from "@/server/research/sessions";
import { listStudies } from "@/server/research/studies";

import { Empty, FlagLine, LINK_44, pickStudy, Section, StudyPicker, Timestamp } from "../_components/common";

export const metadata: Metadata = { title: "Sessions" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/sessions">) {
  return (
    <ConsolePage path="/research/sessions" title="Sessions" description="Study sessions, progress, data integrity, annotations and exclusions.">
      <Sessions searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Sessions({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const principal = await getStaffPrincipal();
  // Exclusion detail reaches identified-scope roles only; others see the category (security-05).
  const rows = await listSessions(pool, study.id, { identified: participantDataScope(principal) === "identified", userId: principal?.userId ?? null });
  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <Section
        id="sessions"
        title="Sessions"
        demo={study.isDemo}
        description="Integrity per session: telemetry events, unresolved sequence gaps, quarantined events, interruptions, protocol deviations, withdrawal and exclusion."
      >
        {rows.length === 0 ? (
          <Empty>No sessions in this study yet.</Empty>
        ) : (
          <Table caption="Sessions and Integrity" number={1} hoverRows density="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Participant</TableHead>
                <TableHead scope="col">Condition</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Started (UTC)</TableHead>
                <TableHead scope="col" numeric>
                  Events
                </TableHead>
                <TableHead scope="col" numeric>
                  Gaps
                </TableHead>
                <TableHead scope="col" numeric>
                  Quarantined
                </TableHead>
                <TableHead scope="col">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const flags = integrityFlags(s);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link className={`${LINK_44} text-id`} href={`/research/sessions/${s.id}`}>
                        {s.participantCode}
                      </Link>
                      {s.period > 1 ? <span className="text-credit">, period {s.period}</span> : null}
                    </TableCell>
                    <TableCell>{s.conditionCode}</TableCell>
                    <TableCell>{s.status.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Timestamp iso={s.startedAt} />
                    </TableCell>
                    <TableCell numeric>{s.events}</TableCell>
                    <TableCell numeric>{s.openGaps}</TableCell>
                    <TableCell numeric>{s.quarantined}</TableCell>
                    <TableCell className="min-w-64 py-2 whitespace-normal">
                      {flags.length === 0 ? (
                        <span className="text-ink-3">None</span>
                      ) : (
                        <ul className="flex flex-col gap-1 font-sans text-[0.875rem] leading-5">
                          {flags.map((f, i) => (
                            <li key={i}>
                              <FlagLine level={f.level} text={f.text} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
